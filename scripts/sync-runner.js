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
const GARMIN_EMAIL = process.env.GARMIN_EMAIL || ''
const GARMIN_PASSWORD = process.env.GARMIN_PASSWORD || ''

// Parse CLI args
const args = process.argv.slice(2)
const isDryRun = args.includes('--dry-run')
const targetUserId = args.includes('--user') 
  ? args[args.indexOf('--user') + 1] 
  : null

// Eight Sleep API (unofficial). Auth moved to OAuth2 — the legacy
// /v1/login session tokens are no longer accepted by data endpoints.
const EIGHT_SLEEP_API = 'https://client-api.8slp.net/v1'
const EIGHT_SLEEP_AUTH_URL = 'https://auth-api.8slp.net/v1/tokens'
// Public OAuth client credentials of the official Eight Sleep app,
// widely published by open-source integrations (pyEight, Home Assistant).
// These identify the app, not a user — user credentials stay encrypted in DB.
const EIGHT_SLEEP_CLIENT_ID = process.env.EIGHT_SLEEP_CLIENT_ID || '0894c7f33bb94800a03f1f4df13a4f38'
const EIGHT_SLEEP_CLIENT_SECRET = process.env.EIGHT_SLEEP_CLIENT_SECRET || 'f0954a3ed5763ba3d06834c73731a32f15f168f47d4f164751275def86db0c76'

// Google Health API (successor to the Fitbit Web API)
const GOOGLE_HEALTH_API = 'https://health.googleapis.com/v4'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

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
      
      case 'garmin_connect': {
        const result = await syncGarminConnect(supabase, userId, credentials)
        fetched = result.fetched
        stored = result.stored
        break
      }

      case 'google_health': {
        const result = await syncGoogleHealth(supabase, userId, credentials)
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
  // OAuth2 password grant (the legacy /v1/login flow returns tokens
  // that data endpoints reject with 401)
  const authResp = await fetch(EIGHT_SLEEP_AUTH_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json',
      'user-agent': 'okhttp/4.9.3'
    },
    body: JSON.stringify({
      client_id: EIGHT_SLEEP_CLIENT_ID,
      client_secret: EIGHT_SLEEP_CLIENT_SECRET,
      grant_type: 'password',
      username: credentials.email,
      password: credentials.password
    })
  })

  if (!authResp.ok) {
    throw new Error(`Eight Sleep auth failed: ${authResp.status}`)
  }

  const authData = await authResp.json()
  if (!authData?.access_token || !authData?.userId) {
    throw new Error('Eight Sleep auth returned an unexpected response')
  }
  const headers = {
    'authorization': `Bearer ${authData.access_token}`,
    'accept': 'application/json',
    'user-agent': 'okhttp/4.9.3'
  }
  const eightUserId = authData.userId

  // Date range (last 3 days to catch any late-processing sleep)
  const now = new Date()
  const from = new Date(now.getTime() - 3 * 86400000)
  const fromStr = from.toISOString().split('T')[0]
  const toStr = now.toISOString().split('T')[0]

  // Fetch trends
  const trendsUrl = `${EIGHT_SLEEP_API}/users/${eightUserId}/trends?tz=UTC&from=${fromStr}&to=${toStr}`
  const trendsResp = await fetch(trendsUrl, { headers })
  if (!trendsResp.ok) {
    throw new Error(`Eight Sleep trends request failed: ${trendsResp.status}`)
  }
  const trends = (await trendsResp.json())?.days || []

  // Fetch intervals for HR data (optional — trends still stored without it)
  const intervalsUrl = `${EIGHT_SLEEP_API}/users/${eightUserId}/intervals`
  const intervalsResp = await fetch(intervalsUrl, { headers })
  const intervals = intervalsResp.ok
    ? (await intervalsResp.json())?.intervals || []
    : []
  
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
 * Google Health API sync (Fitbit devices via the Google Health app)
 */
async function safeText(resp) {
  try { return (await resp.text()).slice(0, 200) } catch { return '' }
}

async function refreshGoogleHealthToken(refreshToken) {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cleanEnv(process.env.GOOGLE_HEALTH_CLIENT_ID),
      client_secret: cleanEnv(process.env.GOOGLE_HEALTH_CLIENT_SECRET),
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  })
  if (!resp.ok) {
    const hint = (resp.status === 400 || resp.status === 401)
      ? ' — re-authorize in Settings (testing-mode Google tokens expire after ~7 days)'
      : ''
    throw new Error(`Google Health token refresh failed: ${resp.status}${hint}`)
  }
  const data = await resp.json()
  if (!data?.access_token) throw new Error('Google Health token refresh returned no access token')
  return data.access_token
}

async function fetchGoogleHealthDaily(headers, kebab, snake, startDate) {
  // Daily data types: try date-based filter first, fall back to interval
  const filters = [
    `${snake}.date >= "${startDate}"`,
    `${snake}.interval.civil_start_time >= "${startDate}T00:00:00"`
  ]
  let lastErr = null
  for (const f of filters) {
    const url = `${GOOGLE_HEALTH_API}/users/me/dataTypes/${kebab}/dataPoints?filter=${encodeURIComponent(f)}`
    const resp = await fetch(url, { headers })
    if (resp.ok) return (await resp.json())?.dataPoints || []
    lastErr = `${kebab}: ${resp.status} ${await safeText(resp)}`
    if (resp.status !== 400) break
  }
  throw new Error(lastErr || `${kebab}: request failed`)
}

function extractDailyValue(dp, camelKey) {
  const payload = dp?.[camelKey]
  if (!payload) return { date: null, value: null }

  let date = null
  const d = payload.date
    || payload.interval?.civilStartTime?.date
    || payload.sampleTime?.civilTime?.date
  if (d?.year) {
    date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
  } else if (payload.interval?.startTime) {
    date = payload.interval.startTime.split('T')[0]
  }

  const timeKeys = ['interval', 'sampleTime', 'date', 'civilTime']
  let value = null
  const firstNumber = (obj) => {
    for (const [k, v] of Object.entries(obj)) {
      if (timeKeys.includes(k)) continue
      if (typeof v === 'number') return v
      if (typeof v === 'string' && v !== '' && !isNaN(Number(v))) return Number(v)
      if (v && typeof v === 'object') {
        const nested = firstNumber(v)
        if (nested !== null) return nested
      }
    }
    return null
  }
  value = firstNumber(payload)
  return { date, value }
}

async function syncGoogleHealth(supabase, userId, credentials) {
  if (!credentials?.refresh_token) {
    throw new Error('Google Health not authorized — connect it in Settings')
  }

  const accessToken = await refreshGoogleHealthToken(credentials.refresh_token)
  const headers = { 'authorization': `Bearer ${accessToken}`, 'accept': 'application/json' }

  const endDate = new Date().toISOString().split('T')[0]
  const startDate = new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]
  const byDate = {}
  const warnings = []

  // Sleep: reconciled stream, main sleep sessions
  try {
    const filter = encodeURIComponent(`sleep.interval.civil_end_time >= "${startDate}"`)
    const resp = await fetch(
      `${GOOGLE_HEALTH_API}/users/me/dataTypes/sleep/dataPoints:reconcile?filter=${filter}`,
      { headers }
    )
    if (!resp.ok) throw new Error(`sleep: ${resp.status} ${await safeText(resp)}`)
    const { dataPoints } = await resp.json()
    for (const dp of dataPoints || []) {
      const sleep = dp.sleep
      if (!sleep?.summary || sleep.metadata?.main === false) continue
      const date = (sleep.interval?.endTime || '').split('T')[0]
      if (!date) continue
      const stages = {}
      for (const st of sleep.summary.stagesSummary || []) {
        stages[st.type] = parseInt(st.minutes) || 0
      }
      byDate[date] = {
        ...byDate[date],
        google_sleep_minutes: parseInt(sleep.summary.minutesAsleep) || null,
        google_sleep_deep_minutes: stages.DEEP ?? null,
        google_sleep_rem_minutes: stages.REM ?? null,
        google_sleep_light_minutes: stages.LIGHT ?? null
      }
    }
  } catch (e) { warnings.push(e.message) }

  // Daily resting heart rate
  try {
    const points = await fetchGoogleHealthDaily(headers, 'daily-resting-heart-rate', 'daily_resting_heart_rate', startDate)
    for (const dp of points) {
      const { date, value } = extractDailyValue(dp, 'dailyRestingHeartRate')
      if (date && value !== null) {
        byDate[date] = { ...byDate[date], fitbit_resting_hr: Math.round(value) }
      }
    }
  } catch (e) { warnings.push(e.message) }

  // Daily HRV
  try {
    const points = await fetchGoogleHealthDaily(headers, 'daily-heart-rate-variability', 'daily_heart_rate_variability', startDate)
    for (const dp of points) {
      const { date, value } = extractDailyValue(dp, 'dailyHeartRateVariability')
      if (date && value !== null) {
        byDate[date] = { ...byDate[date], fitbit_hrv_rmssd: Math.round(value * 10) / 10 }
      }
    }
  } catch (e) { warnings.push(e.message) }

  // Steps: daily roll-up
  try {
    const [sy, sm, sd] = startDate.split('-').map(Number)
    const [ey, em, ed] = endDate.split('-').map(Number)
    const resp = await fetch(`${GOOGLE_HEALTH_API}/users/me/dataTypes/steps/dataPoints:dailyRollUp`, {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({
        range: {
          start: { date: { year: sy, month: sm, day: sd }, time: { hours: 0, minutes: 0, seconds: 0 } },
          end: { date: { year: ey, month: em, day: ed }, time: { hours: 23, minutes: 59, seconds: 59 } }
        },
        windowSizeDays: 1
      })
    })
    if (!resp.ok) throw new Error(`steps: ${resp.status} ${await safeText(resp)}`)
    const { rollupDataPoints } = await resp.json()
    for (const rp of rollupDataPoints || []) {
      const d = rp.civilStartTime?.date
      if (!d?.year) continue
      const date = `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
      const count = parseInt(rp.steps?.countSum)
      if (!isNaN(count)) byDate[date] = { ...byDate[date], steps: count }
    }
  } catch (e) { warnings.push(e.message) }

  if (warnings.length) {
    console.warn(`    ⚠️  Google Health partial fetch issues: ${warnings.join(' | ')}`)
  }

  let fetchedCount = 0
  let storedCount = 0
  for (const [date, entry] of Object.entries(byDate)) {
    fetchedCount++
    if (!isDryRun) {
      const { error } = await supabase.from('biometrics').upsert(
        { user_id: userId, entry_date: date, ...entry },
        { onConflict: 'user_id,entry_date' }
      )
      if (error) {
        console.warn(`    ⚠️  Failed to store ${date}:`, error.message)
      } else {
        storedCount++
      }
    }
  }

  // Surface fetch failures when nothing at all came back
  if (fetchedCount === 0 && warnings.length) {
    throw new Error(warnings.join(' | '))
  }

  console.log(`    📊 Fetched ${fetchedCount} days from Google Health`)
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

// Run if called directly
if (import.meta.main) {
  main()
}

// Export for use in Vercel API routes
export { main as runSync, syncProvider, generateDailySummaries, isDryRun }
