/**
 * useBiometrics composable
 * 
 * Pulls daily health metrics from:
 * - Eight Sleep (RHR, HRV, sleep stages)
 * - Google Fit (sleep data as fallback)
 * - Garmin Connect (stress, body battery, sleep)
 * 
 * Computes derived metrics:
 * - TRIMP (training load)
 * - ACWR (acute:chronic workload ratio)
 * - Wellness score
 */

import { ref, computed } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

// Eight Sleep API constants
const EIGHT_SLEEP_API = 'https://client-api.8slp.net/v1'

// Garmin Connect API constants
const GARMIN_API_BASE = 'https://apis.garmin.com/wellness-api/rest'

export function useBiometrics() {
  const biometrics = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Get biometrics for a date range
  async function loadBiometrics(days = 30) {
    loading.value = true
    try {
      const { db, user } = useSupabase()
      if (!user.value) return

      const since = new Date()
      since.setDate(since.getDate() - days)

      const data = await db.from('biometrics')
        .select('*')
        .eq('user_id', user.value.id)
        .gte('entry_date', since.toISOString().split('T')[0])
        .order('entry_date', { ascending: false })

      biometrics.value = data || []
      error.value = null
    } catch (e) {
      console.error('Failed to load biometrics:', e)
      error.value = e.message
    } finally {
      loading.value = false
    }
  }

  // Get biometrics for a specific date
  function getByDate(date) {
    const dateStr = date instanceof Date 
      ? date.toISOString().split('T')[0] 
      : date
    return biometrics.value.find(b => b.entry_date === dateStr)
  }

  // =====================
  // EIGHT SLEEP INTEGRATION
  // =====================

  /**
   * Authenticate with Eight Sleep and return session token
   */
  async function eightSleepLogin(email, password) {
    const resp = await fetch(`${EIGHT_SLEEP_API}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    if (!resp.ok) {
      throw new Error(`Eight Sleep auth failed: ${resp.status}`)
    }

    const data = await resp.json()
    return {
      token: data.session.token,
      userId: data.session.userId,
      expiresAt: new Date(data.session.expirationDate)
    }
  }

  /**
   * Sync biometrics from Eight Sleep for the last N days
   */
  async function syncEightSleep(credentials, days = 14) {
    const startTime = Date.now()
    let recordsFetched = 0
    let recordsStored = 0
    let status = 'success'
    let errorMsg = null

    try {
      // 1. Authenticate
      const auth = await eightSleepLogin(
        credentials.email,
        credentials.password
      )

      const headers = { 'Session-Token': auth.token }

      // 2. Get device ID
      const meResp = await fetch(`${EIGHT_SLEEP_API}/users/me`, { headers })
      const meData = await meResp.json()
      const deviceId = meData.user.devices[0]

      // 3. Get date range
      const now = new Date()
      const from = new Date(now.getTime() - days * 86400000)
      const fromStr = from.toISOString().split('T')[0]
      const toStr = now.toISOString().split('T')[0]

      // 4. Fetch trends (sleep scores, HRV, stages)
      const trendsUrl = `${EIGHT_SLEEP_API}/users/${auth.userId}/trends?from=${fromStr}&to=${toStr}`
      const trendsResp = await fetch(trendsUrl, { headers })
      const { days: trends } = await trendsResp.json()

      // 5. Fetch intervals (heart rate timeseries)
      const intervalsUrl = `${EIGHT_SLEEP_API}/users/${auth.userId}/intervals`
      const intervalsResp = await fetch(intervalsUrl, { headers })
      const { intervals } = await intervalsResp.json()

      // 6. Map to biometrics and store
      const mapped = trends.map(trend => {
        recordsFetched++
        const interval = findMatchingInterval(intervals, trend.day)
        
        return {
          entry_date: trend.day,
          resting_hr: calculateAvgHRFromInterval(interval),
          hrv_rmssd: trend.sleepQualityScore?.hrv?.current || null,
          hrv_lfn: trend.sleepQualityScore?.hrv?.lf || null,
          hrv_hfn: trend.sleepQualityScore?.hrv?.hf || null,
          sleep_score: trend.score || null,
          sleep_total_minutes: Math.round((trend.presenceDuration || 0) / 60),
          sleep_deep_minutes: Math.round((trend.deepDuration || 0) / 60),
          sleep_rem_minutes: Math.round((trend.remDuration || 0) / 60),
          sleep_light_minutes: Math.round((trend.lightDuration || 0) / 60),
          sleep_awake_minutes: Math.round(
            ((trend.presenceDuration || 0) - (trend.sleepDuration || 0)) / 60
          ),
          respiratory_rate: trend.sleepQualityScore?.respiratoryRate?.current || null,
          toss_turns: trend.tnt || null,
          source: 'eight_sleep',
          raw_json: { trend, interval: interval || null }
        }
      }).filter(b => b.entry_date) // filter out entries without dates

      // 7. Store in Supabase
      const { db, user } = useSupabase()
      for (const entry of mapped) {
        try {
          await db.from('biometrics').upsert({
            user_id: user.value.id,
            ...entry
          })
          recordsStored++
        } catch (e) {
          console.warn(`Failed to store biometric for ${entry.entry_date}:`, e)
        }
      }

      // 8. Store integration config
      await db.from('integrations').upsert({
        user_id: user.value.id,
        provider: 'eight_sleep',
        credentials: {
          email: credentials.email,
          // Store encrypted token in production
          token: auth.token,
          userId: auth.userId
        },
        last_sync: new Date().toISOString(),
        sync_enabled: true
      })

    } catch (e) {
      console.error('Eight Sleep sync failed:', e)
      status = 'error'
      errorMsg = e.message
    }

    // Log sync operation
    await logSync('eight_sleep', 'full_sync', status, recordsFetched, recordsStored, 
      Date.now() - startTime, errorMsg)
    
    return { recordsFetched, recordsStored, status, duration: Date.now() - startTime }
  }

  // =====================
  // GOOGLE FIT INTEGRATION
  // =====================

  /**
   * Sync sleep data from Google Fit REST API
   * Note: API deprecated end of 2026, migrating to Health Connect
   */
  async function syncGoogleFit(accessToken, days = 14) {
    const startTime = Date.now()
    let recordsFetched = 0
    let recordsStored = 0
    let status = 'success'
    let errorMsg = null

    try {
      const endTime = Date.now()
      const startTimeMs = endTime - days * 86400000

      // Aggregate sleep and HR data by day
      const aggregateBody = {
        aggregateBy: [
          {
            bucketByTime: { durationMillis: 86400000 },
            dataSet: 'com.google.sleep.stage'
          },
          {
            bucketByTime: { durationMillis: 86400000 },
            dataSet: 'com.google.heart_rate.bpm'
          }
        ],
        startTimeMillis: startTimeMs,
        endTimeMillis: endTime
      }

      const resp = await fetch(
        'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(aggregateBody)
        }
      )

      if (!resp.ok) {
        throw new Error(`Google Fit API error: ${resp.status}`)
      }

      const data = await resp.json()
      const { db, user } = useSupabase()

      // Parse bucket data
      for (const bucket of data.bucket || []) {
        const date = new Date(bucket.startTimeMillis).toISOString().split('T')[0]
        const entry = parseGoogleFitBucket(bucket, date)
        
        if (entry) {
          recordsFetched++
          await db.from('biometrics').upsert({
            user_id: user.value.id,
            ...entry,
            source: 'google_fit'
          })
          recordsStored++
        }
      }

      // Store integration
      await db.from('integrations').upsert({
        user_id: user.value.id,
        provider: 'google_fit',
        credentials: { access_token: accessToken },
        last_sync: new Date().toISOString(),
        sync_enabled: true
      })

    } catch (e) {
      console.error('Google Fit sync failed:', e)
      status = 'error'
      errorMsg = e.message
    }

    await logSync('google_fit', 'full_sync', status, recordsFetched, recordsStored,
      Date.now() - startTime, errorMsg)

    return { recordsFetched, recordsStored, status, duration: Date.now() - startTime }
  }

  // =====================
  // GARMIN CONNECT INTEGRATION
  // =====================

  /**
   * Sync data from Garmin Connect
   * Uses unofficial API (requires session cookie)
   */
  async function syncGarminConnect(credentials, days = 14) {
    const startTime = Date.now()
    let recordsFetched = 0
    let recordsStored = 0
    let status = 'success'
    let errorMsg = null

    try {
      // Garmin API requires authentication via their OAuth flow
      // This is a simplified version - full implementation needs OAuth
      const headers = {
        'Authorization': `Bearer ${credentials.accessToken}`,
        'Accept': 'application/json'
      }

      const endDate = new Date().toISOString().split('T')[0]
      const startDate = new Date(Date.now() - days * 86400000).toISOString().split('T')[0]

      // Fetch sleep data
      const sleepUrl = `${GARMIN_API_BASE}/sleepData/${startDate}/${endDate}`
      const sleepResp = await fetch(sleepUrl, { headers })
      const sleepData = await sleepResp.json()

      // Fetch stress data
      const stressUrl = `${GARMIN_API_BASE}/stressData/${startDate}/${endDate}`
      const stressResp = await fetch(stressUrl, { headers })
      const stressData = await stressResp.json()

      const { db, user } = useSupabase()

      // Combine and store
      const allDates = new Set([
        ...(sleepData.sleepScores || []).map(s => s.date),
        ...(stressData.stressScores || []).map(s => s.date)
      ])

      for (const date of allDates) {
        const sleepEntry = sleepData.sleepScores?.find(s => s.date === date)
        const stressEntry = stressData.stressScores?.find(s => s.date === date)

        if (sleepEntry || stressEntry) {
          recordsFetched++
          const entry = {
            entry_date: date,
            garmin_sleep_minutes: sleepEntry?.sleepTimeSegments?.reduce((sum, s) => 
              sum + (s.duration || 0), 0) || null,
            garmin_sleep_deep_minutes: sleepEntry?.sleepTimeSegments?.filter(
              s => s.type === 'DEEP').reduce((sum, s) => sum + (s.duration || 0), 0) || null,
            garmin_sleep_rem_minutes: sleepEntry?.sleepTimeSegments?.filter(
              s => s.type === 'REM').reduce((sum, s) => sum + (s.duration || 0), 0) || null,
            garmin_stress_score: stressEntry?.stressScore || null,
            garmin_body_battery: stressEntry?.bodyBattery?.charge || null,
            garmin_respiratory_rate: stressEntry?.respirationRate || null,
            source: 'garmin'
          }

          await db.from('biometrics').upsert({
            user_id: user.value.id,
            ...entry
          })
          recordsStored++
        }
      }

      await db.from('integrations').upsert({
        user_id: user.value.id,
        provider: 'garmin_connect',
        credentials: { 
          email: credentials.email,
          access_token: credentials.accessToken 
        },
        last_sync: new Date().toISOString(),
        sync_enabled: true
      })

    } catch (e) {
      console.error('Garmin sync failed:', e)
      status = 'error'
      errorMsg = e.message
    }

    await logSync('garmin_connect', 'full_sync', status, recordsFetched, recordsStored,
      Date.now() - startTime, errorMsg)

    return { recordsFetched, recordsStored, status, duration: Date.now() - startTime }
  }

  // =====================
  // COMPUTED METRICS
  // =====================

  /**
   * Calculate TRIMP (Training Impulse)
   * TRIMP = duration × HRreserv × 0.64 × e^(a × HRreserv)
   */
  function calculateTRIMP(durationMin, hrAvg, hrMax, hrRest, gender) {
    if (!durationMin || !hrAvg || !hrMax || !hrRest) return null
    
    const hrReserve = (hrAvg - hrRest) / (hrMax - hrRest)
    if (hrReserve < 0 || hrReserve > 1) return null
    
    // a = 1.92 for women, 1.67 for men
    const a = gender === 'female' ? 1.92 : 1.67
    return durationMin * hrReserve * 0.64 * Math.exp(a * hrReserve)
  }

  /**
   * Calculate ACWR (Acute:Chronic Workload Ratio)
   * ACWR = 7-day avg load / 28-day avg load
   */
  function calculateACWR(dailyLoads) {
    if (dailyLoads.length < 28) return null
    
    const recent7 = dailyLoads.slice(-7)
    const recent28 = dailyLoads.slice(-28)
    
    const acute = recent7.reduce((a, b) => a + b, 0) / 7
    const chronic = recent28.reduce((a, b) => a + b, 0) / 28
    
    if (chronic === 0) return null
    return acute / chronic
  }

  /**
   * Compute wellness score from biometrics
   */
  function computeWellnessScore(bio) {
    if (!bio) return null
    
    let score = 0
    let components = 0
    
    // Sleep score (0-100) from Eight Sleep
    if (bio.sleep_score) {
      score += bio.sleep_score * 0.4
      components += 0.4
    } else if (bio.sleep_total_minutes) {
      // Fallback: sleep duration weighting (target 7.5h = 450min)
      const sleepScore = Math.min(100, (bio.sleep_total_minutes / 450) * 100)
      score += sleepScore * 0.4
      components += 0.4
    }
    
    // HRV (compare to user baseline)
    if (bio.hrv_rmssd) {
      // Simple: higher HRV = better, scale 20-120ms
      const hrvScore = Math.min(100, Math.max(0, (bio.hrv_rmssd - 20) / (120 - 20) * 100))
      score += hrvScore * 0.3
      components += 0.3
    }
    
    // Resting HR (lower = better, scale 40-80bpm)
    if (bio.resting_hr) {
      const rhrScore = Math.min(100, Math.max(0, 100 - (bio.resting_hr - 40) / (80 - 40) * 100))
      score += rhrScore * 0.3
      components += 0.3
    }
    
    if (components === 0) return null
    return Math.round(score / components)
  }

  /**
   * Determine if recovery day is recommended
   */
  function recommendRecovery(bio, recentWorkouts) {
    if (!bio) return false
    
    const reasons = []
    
    // High RHR (>10% above baseline)
    if (bio.resting_hr && bio.resting_hr > 65) {
      reasons.push('elevated_rhr')
    }
    
    // Low HRV (<20% below baseline)
    if (bio.hrv_rmssd && bio.hrv_rmssd < 40) {
      reasons.push('low_hrv')
    }
    
    // Poor sleep (<6 hours or sleep score <60)
    if ((bio.sleep_total_minutes && bio.sleep_total_minutes < 360) ||
        (bio.sleep_score && bio.sleep_score < 60)) {
      reasons.push('poor_sleep')
    }
    
    // High ACWR (>1.5)
    if (bio.acwr && bio.acwr > 1.5) {
      reasons.push('high_acwr')
    }
    
    // High stress score (Garmin)
    if (bio.garmin_stress_score && bio.garmin_stress_score > 70) {
      reasons.push('high_stress')
    }
    
    return reasons.length > 0 ? reasons : null
  }

  // =====================
  // DAILY SUMMARY GENERATION
  // =====================

  /**
   * Generate daily summary combining biometrics + workout data
   */
  async function generateDailySummary(date = new Date()) {
    const { db, user } = useSupabase()
    if (!user.value) return null
    
    const dateStr = date.toISOString().split('T')[0]
    
    // Get biometrics
    const { data: bio } = await db.from('biometrics')
      .select('*')
      .eq('user_id', user.value.id)
      .eq('entry_date', dateStr)
      .single()
    
    // Get workout log
    const { data: log } = await db.from('workout_logs')
      .select('*')
      .eq('user_id', user.value.id)
      .eq('completed_at', dateStr)
      .single()
    
    // Get readiness entry (if exists)
    const { data: readiness } = await db.from('readiness_entries')
      .select('*')
      .eq('user_id', user.value.id)
      .eq('entry_date', dateStr)
      .single()
    
    // Compute wellness score
    const wellnessScore = computeWellnessScore(bio)
    
    // Build summary
    const summary = {
      user_id: user.value.id,
      entry_date: dateStr,
      workout_count: log ? 1 : 0,
      planned_duration_minutes: log?.planned_duration ? parseInt(log.planned_duration) : 0,
      actual_duration_minutes: log?.actual_duration || 0,
      actual_distance_km: log?.actual_distance || 0,
      actual_elevation_m: log?.actual_elevation || 0,
      actual_hr_avg: log?.actual_hr_avg || null,
      rpe: log?.rpe || null,
      training_load: log?.training_load || null,
      resting_hr: bio?.resting_hr || null,
      hrv_rmssd: bio?.hrv_rmssd || null,
      sleep_total_minutes: bio?.sleep_total_minutes || null,
      sleep_deep_minutes: bio?.sleep_deep_minutes || null,
      sleep_rem_minutes: bio?.sleep_rem_minutes || null,
      wellness_score: wellnessScore,
      readiness_score: readiness?.readiness_score || null,
      soreness: readiness?.soreness || null,
      stress: readiness?.stress || null,
      sleep_quality: readiness?.sleep_quality || null,
      mood: readiness?.mood || null,
      acwr: bio?.acwr || null
    }
    
    // Generate recommendation
    const recoveryReasons = recommendRecovery(bio)
    if (recoveryReasons) {
      summary.recommendation = 'recover'
      summary.notes = `Recovery recommended: ${recoveryReasons.join(', ')}`
    } else if (summary.training_load && summary.acwr && summary.acwr > 1.5) {
      summary.recommendation = 'easy'
      summary.notes = 'Easy training only - high ACWR'
    } else {
      summary.recommendation = 'train'
    }
    
    // Store summary
    await db.from('daily_summaries').upsert(summary)
    
    return summary
  }

  // =====================
  // SYNC LOG HELPER
  // =====================

  async function logSync(provider, operation, status, fetched, stored, durationMs, errorMsg) {
    try {
      const { db, user } = useSupabase()
      if (!user.value) return
      
      await db.from('sync_logs').insert({
        user_id: user.value.id,
        provider,
        operation,
        status,
        records_fetched: fetched,
        records_stored: stored,
        duration_ms: durationMs,
        error_message: errorMsg,
        triggered_by: 'manual',
        completed_at: new Date().toISOString()
      })
    } catch (e) {
      console.warn('Failed to log sync:', e)
    }
  }

  // =====================
  // COMPUTED PROPERTIES
  // =====================

  const latestBiometrics = computed(() => biometrics.value[0])
  
  const wellnessTrend = computed(() => {
    return biometrics.value
      .slice(0, 14)
      .map(b => ({
        date: b.entry_date,
        score: b.wellness_score,
        rhr: b.resting_hr,
        hrv: b.hrv_rmssd
      }))
      .reverse()
  })

  const recoveryDays = computed(() => {
    return biometrics.value.filter(b => b.is_recovery_day).length
  })

  // =====================
  // INTEGRATION STATUS
  // =====================

  async function getIntegrationStatus() {
    const { db, user } = useSupabase()
    if (!user.value) return []
    
    const { data } = await db.from('integrations')
      .select('*')
      .eq('user_id', user.value.id)
    
    return data || []
  }

  async function getSyncHistory(days = 30) {
    const { db, user } = useSupabase()
    if (!user.value) return []
    
    const since = new Date()
    since.setDate(since.getDate() - days)
    
    const { data } = await db.from('sync_logs')
      .select('*')
      .eq('user_id', user.value.id)
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false })
    
    return data || []
  }

  return {
    // State
    biometrics,
    loading,
    error,
    
    // Data fetching
    loadBiometrics,
    getByDate,
    
    // Sync functions
    syncEightSleep,
    syncGoogleFit,
    syncGarminConnect,
    generateDailySummary,
    
    // Computed metrics
    calculateTRIMP,
    calculateACWR,
    computeWellnessScore,
    recommendRecovery,
    
    // Computed properties
    latestBiometrics,
    wellnessTrend,
    recoveryDays,
    
    // Integration management
    getIntegrationStatus,
    getSyncHistory
  }
}

// =====================
// HELPER FUNCTIONS
// =====================

function findMatchingInterval(intervals, dateStr) {
  if (!intervals || !dateStr) return null
  return intervals.find(interval => 
    interval.ts?.startsWith(dateStr) || 
    interval.date === dateStr
  )
}

function calculateAvgHRFromInterval(interval) {
  if (!interval?.timeseries?.heartRate) return null
  
  const hrData = interval.timeseries.heartRate
  if (!hrData.length) return null
  
  // Take average of nighttime HR (last 6 hours of sleep)
  const nighttime = hrData.slice(-360) // Last 360 readings (~6h at 1/min)
  if (!nighttime.length) return null
  
  const sum = nighttime.reduce((acc, [, hr]) => acc + (hr || 0), 0)
  return Math.round(sum / nighttime.length)
}

function parseGoogleFitBucket(bucket, date) {
  let sleepMinutes = 0
  let deepMinutes = 0
  let remMinutes = 0
  let lightMinutes = 0
  let avgHr = null
  
  for (const dataset of bucket.dataset || []) {
    if (dataset.datasetId.includes('sleep.stage')) {
      for (const point of dataset.point || []) {
        const startTime = parseInt(point.startTimeNanos) / 1e6 // to ms
        const endTime = parseInt(point.endTimeNanos) / 1e6
        const durationMin = (endTime - startTime) / 60000
        
        const value = point.value?.[0]?.intVal
        sleepMinutes += durationMin
        
        // Sleep stage values: 1=awake, 2=sleep, 3=deep, 4=light, 5=REM
        if (value === 3) deepMinutes += durationMin
        else if (value === 4) lightMinutes += durationMin
        else if (value === 5) remMinutes += durationMin
      }
    }
    
    if (dataset.datasetId.includes('heart_rate.bpm')) {
      const hrValues = []
      for (const point of dataset.point || []) {
        if (point.value?.[0]?.fpVal) {
          hrValues.push(point.value[0].fpVal)
        }
      }
      if (hrValues.length) {
        avgHr = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
      }
    }
  }
  
  if (sleepMinutes === 0 && !avgHr) return null
  
  return {
    entry_date: date,
    resting_hr: avgHr,
    google_sleep_minutes: Math.round(sleepMinutes),
    google_sleep_deep_minutes: Math.round(deepMinutes),
    google_sleep_rem_minutes: Math.round(remMinutes),
    google_sleep_light_minutes: Math.round(lightMinutes)
  }
}

export default useBiometrics