#!/usr/bin/env bun
/**
 * Daily Sync Orchestrator
 * 
 * Runs all enabled biometrics and workout syncs for all users.
 * Designed to run via cron or a scheduled job (e.g., GitHub Actions, Vercel cron, or local).
 * 
 * Usage:
 *   bun scripts/sync-runner.js              # Sync for all users
 *   bun scripts/sync-runner.js --user <id>  # Sync for specific user
 *   bun scripts/sync-runner.js --dry-run    # Preview without writing
 * 
 * Schedule (cron example, runs at 5:00 UTC daily):
 *   0 5 * * * cd /Users/charlessese/Documents/trailcoach && bun scripts/sync-runner.js
 */

import { createClient } from '@supabase/supabase-js'
import { decryptCredentials } from '../api/_lib/crypto.js'

// Tolerate stray whitespace/escaped newlines in env values
const cleanEnv = (v) => (v || '').replace(/\\n/g, '').trim()

// Environment variables
const SUPABASE_URL = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
const SUPABASE_SERVICE_ROLE = cleanEnv(process.env.SUPABASE_SERVICE_ROLE)
const EIGHT_SLEEP_EMAIL = process.env.EIGHT_SLEEP_EMAIL || ''
const EIGHT_SLEEP_PASSWORD = process.env.EIGHT_SLEEP_PASSWORD || ''
const GOOGLE_FIT_REFRESH_TOKEN = process.env.GOOGLE_FIT_REFRESH_TOKEN || ''
const GARMIN_EMAIL = process.env.GARMIN_EMAIL || ''
const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD || ''

// Parse CLI args
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const targetUserId = args.includes('--user') 
  ? args[args.indexOf('--user') + 1] 
  : null

// Eight Sleep API
const EIGHT_SLEEP_API = 'https://client-api.8slp.net/v1'

/**
 * Main orchestrator
 */
async function main() {
  console.log(`[${new Date().toISOString()}] Sync orchestrator starting...`)
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`)
  
  // Initialize Supabase with service role (admin access)
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false }
  })

  try {
    // Get all users with enabled integrations
    const { data: integrations, error: intErr } = await supabase
      .from('integrations')
      .select('*')
      .eq('sync_enabled', true)
    
    if (intErr) throw intErr
    
    // Group by user
    const userIntegrations = {}
    for (const int of integrations) {
      if (!userIntegrations[int.user_id]) {
        userIntegrations[int.user_id] = []
      }
      userIntegrations[int.user_id].push(int)
    }
    
    // Filter to target user if specified
    const userIds = targetUserId 
      ? [targetUserId] 
      : Object.keys(userIntegrations)
    
    console.log(`Found ${userIds.length} users with enabled integrations`)
    
    // Sync each user
    const results = []
    for (const userId of userIds) {
      const userInts = userIntegrations[userId] || []
      const result = await syncUser(supabase, userId, userInts)
      results.push(result)
    }
    
    // Summary
    console.log('\n=== SYNC SUMMARY ===')
    console.log(`Users processed: ${results.length}`)
    console.log(`Total records fetched: ${results.reduce((s, r) => s + r.totalFetched, 0)}`)
    console.log(`Total records stored: ${results.reduce((s, r) => s + r.totalStored, 0)}`)
    console.log(`Errors: ${results.filter(r => r.error).length}`)
    
    // Write summary to sync_logs
    await logOrchestratorRun(supabase, results)
    
    console.log(`\n[${new Date().toISOString()}] Sync complete.`)
    
  } catch (e) {
    console.error('Orchestrator error:', e)
    process.exit(1)
  }
}

/**
 * Sync all enabled integrations for a single user
 */
async function syncUser(supabase, userId, integrations) {
  console.log(`\n--- Syncing user: ${userId} ---`)
  
  const result = {
    userId,
    totalFetched: 0,
    totalStored: 0,
    providers: [],
    error: null
  }
  
  try {
    for (const int of integrations) {
      const providerResult = await syncProvider(supabase, userId, int)
      result.providers.push(providerResult)
      result.totalFetched += providerResult.fetched
      result.totalStored += providerResult.stored
    }
    
    // Generate daily summaries after all syncs
    if (!isDryRun) {
      await generateDailySummaries(supabase, userId)
    }
    
  } catch (e) {
    console.error(`Error syncing user ${userId}:`, e)
    result.error = e.message
  }
  
  return result
}

/**
 * Sync a single provider for a user
 */
async function syncProvider(supabase, userId, integration, triggeredBy = 'scheduled') {
  const { provider, credentials: rawCredentials, last_sync } = integration
  const startTime = Date.now()

  console.log(`  📡 Syncing ${provider}...`)

  // Decrypt credentials (AES-256-GCM; fails closed — a decryption
  // error skips this provider rather than proceeding with bad data)
  let credentials
  try {
    credentials = decryptCredentials(rawCredentials)
  } catch (e) {
    console.error(`    ❌ Cannot decrypt ${provider} credentials: ${e.message}`)
    return { provider, fetched: 0, stored: 0, status: 'error', error: 'Could not decrypt stored credentials', duration: Date.now() - startTime }
  }

  let fetched = 0
  let stored = 0
  let status = 'success'
  let errorMsg = null
  
  try {
    switch (provider) {
      case 'eight_sleep': {
        const result = await syncEightSleep(supabase, userId, credentials)
        fetched = result.fetched
        stored = result.stored
        break
      }
      
      case 'google_fit': {
        const result = await syncGoogleFit(supabase, userId, credentials)
        fetched = result.fetched
        stored = result.stored
        break
      }
      
      case 'garmin_connect': {
        const result = await syncGarminConnect(supabase, userId, credentials)
        fetched = result.fetched
        stored = result.stored
        break
      }
      
      case 'strava': {
        // Strava sync is handled by the app already
        console.log(`    ℹ️  Strava sync handled by app`)
        return { provider, fetched: 0, stored: 0, status: 'skipped' }
      }
      
      default:
        console.log(`    ⚠️  Unknown provider: ${provider}`)
        return { provider, fetched: 0, stored: 0, status: 'skipped' }
    }
    
    console.log(`    ✅ Fetched: ${fetched}, Stored: ${stored}`)
    
  } catch (e) {
    console.error(`    ❌ Error: ${e.message}`)
    status = 'error'
    errorMsg = e.message
  }
  
  // Log the sync
  if (!isDryRun) {
    await supabase.from('sync_logs').insert({
      user_id: userId,
      provider,
      operation: 'full_sync',
      status,
      records_fetched: fetched,
      records_stored: stored,
      duration_ms: Date.now() - startTime,
      error_message: errorMsg,
      triggered_by: triggeredBy
    })
    
    // Update last_sync timestamp
    await supabase
      .from('integrations')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider)
  }
  
  return { provider, fetched, stored, status, error: errorMsg, duration: Date.now() - startTime }
}

/**
 * Eight Sleep sync
 */
async function syncEightSleep(supabase, userId, credentials) {
  const fetched = 0
  const stored = 0
  
  // Login
  const loginResp = await fetch(`${EIGHT_SLEEP_API}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: credentials.email,
      password: credentials.password
    })
  })
  
  if (!loginResp.ok) {
    throw new Error(`Eight Sleep login failed: ${loginResp.status}`)
  }
  
  const { session } = await loginResp.json()
  const token = session.token
  const headers = { 'Session-Token': token }
  
  // Get device ID
  const meResp = await fetch(`${EIGHT_SLEEP_API}/users/me`, { headers })
  const meData = await meResp.json()
  const deviceId = meData.user.devices[0]
  
  // Date range (last 3 days to catch any late-processing sleep)
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 86400000)
  const fromStr = from.toISOString().split('T')[0]
  const toStr = now.toISOString().split('T')[0]
  
  // Fetch trends
  const trendsUrl = `${EIGHT_SLEEP_API}/users/${deviceId}/trends?from=${fromStr}&to=${toStr}`
  const trendsResp = await fetch(trendsUrl, { headers })
  const { days: trends } = await trendsResp.json()
  
  // Fetch intervals for HR data
  const intervalsUrl = `${EIGHT_SLEEP_API}/users/${deviceId}/intervals`
  const intervalsResp = await fetch(intervalsUrl, { headers })
  const { intervals } = await intervalsResp.json()
  
  console.log(`    📊 Found ${trends.length} sleep sessions`)
  
  let fetchedCount = 0
  let storedCount = 0
  
  for (const trend of trends) {
    fetchedCount++
    const entry = mapEightSleepTrend(trend, intervals)
    
    if (entry && !isDryRun) {
      const { error } = await supabase.from('biometrics').upsert({
        user_id: userId,
        ...entry
      })
      
      if (error) {
        console.warn(`    ⚠️  Failed to store ${entry.entry_date}:`, error.message)
      } else {
        storedCount++
      }
    }
  }
  
  return { fetched: fetchedCount, stored: storedCount }
}

/**
 * Google Fit sync
 */
async function syncGoogleFit(supabase, userId, credentials) {
  // Refresh token if needed (also when we only have a refresh token)
  let accessToken = credentials.access_token

  const needsRefresh = !accessToken ||
    (credentials.expires_at && Date.now() > credentials.expires_at)

  if (needsRefresh && credentials.refresh_token) {
    // Refresh token
    const refreshResp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: credentials.refresh_token,
        grant_type: 'refresh_token'
      })
    })
    
    if (refreshResp.ok) {
      const tokenData = await refreshResp.json()
      accessToken = tokenData.access_token
      
      // Update stored tokens
      await supabase.from('integrations').update({
        credentials: {
          ...credentials,
          access_token: accessToken,
          expires_at: Date.now() + tokenData.expires_in * 1000
        }
      }).eq('user_id', userId).eq('provider', 'google_fit')
    }
  }
  
  // Fetch data
  const endTime = Date.now()
  const startTime = endTime - 3 * 86400000
  
  const aggregateBody = {
    aggregateBy: [
      { bucketByTime: { durationMillis: 86400000 }, dataSet: 'com.google.sleep.stage' },
      { bucketByTime: { durationMillis: 86400000 }, dataSet: 'com.google.heart_rate.bpm' }
    ],
    startTimeMillis: startTime,
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
  let fetchedCount = 0
  let storedCount = 0
  
  for (const bucket of data.bucket || []) {
    const date = new Date(bucket.startTimeMillis).toISOString().split('T')[0]
    const entry = parseGoogleFitBucket(bucket, date)
    
    if (entry) {
      fetchedCount++
      if (!isDryRun) {
        const { error } = await supabase.from('biometrics').upsert({
          user_id: userId,
          ...entry,
          source: 'google_fit'
        })
        if (!error) storedCount++
      }
    }
  }
  
  console.log(`    📊 Fetched ${fetchedCount} days from Google Fit`)
  return { fetched: fetchedCount, stored: storedCount }
}

/**
 * Garmin Connect sync
 */
async function syncGarminConnect(supabase, userId, credentials) {
  const headers = {
    'Authorization': `Bearer ${credentials.access_token}`,
    'Accept': 'application/json',
    'Accept-Language': 'en-US,en;q=0.9'
  }
  
  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  
  // Fetch sleep data
  const sleepUrl = `https://apis.garmin.com/wellness-api/rest/sleepData/${startDate}/${endDate}`
  const sleepResp = await fetch(sleepUrl, { headers })
  
  // Fetch stress data
  const stressUrl = `https://apis.garmin.com/wellness-api/rest/stressData/${startDate}/${endDate}`
  const stressResp = await fetch(stressUrl, { headers })
  
  if (!sleepResp.ok || !stressResp.ok) {
    throw new Error(`Garmin API errors: sleep=${sleepResp.status}, stress=${stressResp.status}`)
  }
  
  const sleepData = await sleepResp.json()
  const stressData = await stressResp.json()
  
  let fetchedCount = 0
  let storedCount = 0
  
  // Collect all unique dates
  const allDates = new Set()
  for (const s of sleepData.sleepScores || []) allDates.add(s.date)
  for (const s of stressData.stressScores || []) allDates.add(s.date)
  
  for (const date of allDates) {
    const sleepEntry = sleepData.sleepScores?.find(s => s.date === date)
    const stressEntry = stressData.stressScores?.find(s => s.date === date)
    
    if (sleepEntry || stressEntry) {
      fetchedCount++
      
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
      
      if (!isDryRun) {
        const { error } = await supabase.from('biometrics').upsert({
          user_id: userId,
          ...entry
        })
        if (!error) storedCount++
      }
    }
  }
  
  console.log(`    📊 Fetched ${fetchedCount} days from Garmin`)
  return { fetched: fetchedCount, stored: storedCount }
}

/**
 * Generate daily summaries for the past 7 days
 */
async function generateDailySummaries(supabase, userId) {
  console.log(`    📝 Generating daily summaries...`)
  
  const now = new Date()
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const dateStr = date.toISOString().split('T')[0]
    
    // Get biometrics for the day
    const { data: bio } = await supabase
      .from('biometrics')
      .select('*')
      .eq('user_id', userId)
      .eq('entry_date', dateStr)
      .maybeSingle()
    
    // Get workout log for the day
    const { data: log } = await supabase
      .from('workout_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('completed_at', `${dateStr}T00:00:00`)
      .lte('completed_at', `${dateStr}T23:59:59`)
      .maybeSingle()
    
    // Get readiness entry
    const { data: readiness } = await supabase
      .from('readiness_entries')
      .select('*')
      .eq('user_id', userId)
      .eq('entry_date', dateStr)
      .maybeSingle()
    
    // Compute wellness score
    let wellnessScore = null
    if (bio) {
      let score = 0
      let components = 0
      
      if (bio.sleep_score) {
        score += bio.sleep_score * 0.4
        components += 0.4
      }
      if (bio.hrv_rmssd) {
        const hrvScore = Math.min(100, Math.max(0, (bio.hrv_rmssd - 20) / 100 * 100))
        score += hrvScore * 0.3
        components += 0.3
      }
      if (bio.resting_hr) {
        const rhrScore = Math.min(100, Math.max(0, 100 - (bio.resting_hr - 40) / 40 * 100))
        score += rhrScore * 0.3
        components += 0.3
      }
      
      wellnessScore = components > 0 ? Math.round(score / components) : null
    }
    
    // Determine recovery recommendation
    let recommendation = 'train'
    let notes = null
    
    if (bio) {
      const reasons = []
      if (bio.resting_hr && bio.resting_hr > 65) reasons.push('elevated_rhr')
      if (bio.hrv_rmssd && bio.hrv_rmssd < 40) reasons.push('low_hrv')
      if (bio.sleep_total_minutes && bio.sleep_total_minutes < 360) reasons.push('poor_sleep')
      
      if (reasons.length > 0) {
        recommendation = 'recover'
        notes = `Recovery recommended: ${reasons.join(', ')}`
      }
    }
    
    if (!isDryRun) {
      await supabase.from('daily_summaries').upsert({
        user_id: userId,
        entry_date: dateStr,
        workout_count: log ? 1 : 0,
        actual_duration_minutes: log?.actual_duration || 0,
        actual_distance_km: log?.actual_distance || 0,
        actual_elevation_m: log?.actual_elevation || 0,
        actual_hr_avg: log?.actual_hr_avg || null,
        rpe: log?.rpe || null,
        resting_hr: bio?.resting_hr || null,
        hrv_rmssd: bio?.hrv_rmssd || null,
        sleep_total_minutes: bio?.sleep_total_minutes || null,
        sleep_deep_minutes: bio?.sleep_deep_minutes || null,
        sleep_rem_minutes: bio?.sleep_rem_minutes || null,
        wellness_score: wellnessScore,
        soreness: readiness?.soreness || null,
        stress: readiness?.stress || null,
        mood: readiness?.mood || null,
        recommendation,
        notes
      })
    }
  }
  
  console.log(`    ✅ Daily summaries generated`)
}

/**
 * Log orchestrator run
 */
async function logOrchestratorRun(supabase, results) {
  const timestamp = new Date().toISOString()
  const logEntry = {
    user_id: null,
    provider: 'orchestrator',
    operation: 'daily_sync_run',
    status: results.some(r => r.error) ? 'partial' : 'success',
    records_fetched: results.reduce((s, r) => s + r.totalFetched, 0),
    records_stored: results.reduce((s, r) => s + r.totalStored, 0),
    triggered_by: 'scheduled',
    started_at: timestamp,
    completed_at: timestamp
  }
  
  try {
    await supabase.from('sync_logs').insert(logEntry)
  } catch (e) {
    console.warn('Failed to write orchestrator log:', e.message)
  }
}

// =====================
// MAPPING FUNCTIONS
// =====================

function mapEightSleepTrend(trend, intervals) {
  if (!trend.day) return null
  
  // Find matching interval for HR data
  const interval = intervals?.find(i => i.ts?.startsWith(trend.day))
  
  return {
    entry_date: trend.day,
    resting_hr: calculateAvgHRFromInterval(interval),
    hrv_rmssd: trend.sleepQualityScore?.hrv?.current || null,
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
    raw_json: { trend_id: trend.day }
  }
}

function calculateAvgHRFromInterval(interval) {
  if (!interval?.timeseries?.heartRate) return null
  
  const hrData = interval.timeseries.heartRate
  if (!hrData.length) return null
  
  // Take average of last 360 readings (~6h at 1/min)
  const nighttime = hrData.slice(-360)
  if (!nighttime.length) return null
  
  const sum = nighttime.reduce((acc, [, hr]) => acc + (hr || 0), 0)
  return Math.round(sum / nighttime.length)
}

function parseGoogleFitBucket(bucket, date) {
  let sleepMinutes = 0
  let deepMinutes = 0
  let remMinutes = 0
  let avgHr = null
  
  for (const dataset of bucket.dataset || []) {
    if (dataset.datasetId.includes('sleep.stage')) {
      for (const point of dataset.point || []) {
        const durationMin = (parseInt(point.endTimeNanos) - parseInt(point.startTimeNanos)) / 6e7
        const value = point.value?.[0]?.intVal
        
        sleepMinutes += durationMin
        if (value === 3) deepMinutes += durationMin
        else if (value === 5) remMinutes += durationMin
      }
    }
    
    if (dataset.datasetId.includes('heart_rate.bpm')) {
      const hrValues = []
      for (const point of dataset.point || []) {
        if (point.value?.[0]?.fpVal) hrValues.push(point.value[0].fpVal)
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
    google_sleep_rem_minutes: Math.round(remMinutes)
  }
}

// Run if called directly
if (import.meta.main) {
  main()
}

// Export for use in Vercel API routes
export { main as runSync, syncProvider, generateDailySummaries, isDryRun }
