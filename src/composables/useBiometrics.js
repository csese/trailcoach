/**
 * useBiometrics composable
 * 
 * Pulls daily health metrics from:
 * - Eight Sleep (RHR, HRV, sleep stages)
 * - Garmin Connect (stress, body battery, sleep)
 * 
 * Computes derived metrics:
 * - TRIMP (training load)
 * - ACWR (acute:chronic workload ratio)
 * - Wellness score
 */

import { ref, computed } from 'vue'
import { useSupabase } from '@/composables/useSupabase'
import { apiFetch } from '@/composables/useApi'

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
  // PROVIDER SYNC (server-side)
  //
  // Provider APIs (Eight Sleep, Google Fit, Garmin) do not allow
  // cross-origin browser calls, so manual sync runs through
  // /api/integrations/sync — the same code path as the nightly cron.
  // Credentials are encrypted server-side with a server-only key;
  // the browser never stores or reads them back.
  // =====================

  async function syncViaServer(provider, credentials) {
    loading.value = true
    error.value = null
    try {
      const result = await apiFetch('/api/integrations/sync', { provider, credentials })
      if (result.status !== 'success') {
        error.value = result.error || `${provider} sync failed`
      }
      return {
        recordsFetched: result.fetched || 0,
        recordsStored: result.stored || 0,
        status: result.status,
        error: result.error || null
      }
    } catch (e) {
      console.error(`${provider} sync failed:`, e)
      error.value = e.message
      return { recordsFetched: 0, recordsStored: 0, status: 'error', error: e.message }
    } finally {
      loading.value = false
    }
  }

  function syncEightSleep(credentials) {
    return syncViaServer('eight_sleep', {
      email: credentials.email,
      password: credentials.password
    })
  }

  function syncGarminConnect(credentials) {
    return syncViaServer('garmin_connect', {
      email: credentials.email || null,
      password: credentials.password || null,
      access_token: credentials.accessToken || credentials.access_token || null
    })
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

export default useBiometrics
