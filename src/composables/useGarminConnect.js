/**
 * useGarminConnect composable
 * 
 * Handles Garmin Connect OAuth and data fetching.
 * Garmin Connect uses OAuth 1.0a for authentication.
 * 
 * Data available:
 * - Sleep stages (deep, REM, light, awake)
 * - Stress scores (0-100)
 * - Body Battery energy reserves (0-100)
 * - Respiratory rate
 * - Heart rate (resting and during activities)
 * - Steps, calories, hydration
 */

import { ref } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

const GARMIN_OAUTH_URL = 'https://connect.garmin.com/oauthValidate'
const GARMIN_API_BASE = 'https://apis.garmin.com/wellness-api/rest'

export function useGarminConnect() {
  const connected = ref(false)
  const loading = ref(false)
  const error = ref(null)

  /**
   * Get OAuth URL for user to authorize
   */
  function getAuthUrl(clientId, redirectUri) {
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'activity wellness sleep nutrition'
    })
    return `https://connect.garmin.com/oauthValidate?${params.toString()}`
  }

  /**
   * Exchange authorization code for tokens
   */
  async function exchangeCode(code, clientId, clientSecret, redirectUri) {
    loading.value = true
    try {
      const resp = await fetch('https://connect.garmin.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': 'Basic ' + btoa(`${clientId}:${clientSecret}`)
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri
        })
      })

      if (!resp.ok) {
        throw new Error(`Token exchange failed: ${resp.status}`)
      }

      const data = await resp.json()
      
      // Store integration
      const { db, user } = useSupabase()
      await db.from('integrations').upsert({
        user_id: user.value.id,
        provider: 'garmin_connect',
        credentials: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_at: Date.now() + data.expires_in * 1000
        },
        last_sync: null,
        sync_enabled: true
      })

      connected.value = true
      error.value = null
      return data
    } catch (e) {
      console.error('Garmin OAuth error:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Fetch sleep data for a date range
   */
  async function fetchSleepData(startDate, endDate, accessToken) {
    const url = `${GARMIN_API_BASE}/sleepData/${startDate}/${endDate}`
    
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })

    if (!resp.ok) {
      throw new Error(`Garmin sleep API error: ${resp.status}`)
    }

    return await resp.json()
  }

  /**
   * Fetch stress data
   */
  async function fetchStressData(startDate, endDate, accessToken) {
    const url = `${GARMIN_API_BASE}/stressData/${startDate}/${endDate}`
    
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    })

    if (!resp.ok) {
      throw new Error(`Garmin stress API error: ${resp.status}`)
    }

    return await resp.json()
  }

  /**
   * Fetch body battery (energy reserves) data
   */
  async function fetchBodyBattery(startDate, endDate, accessToken) {
    const url = `${GARMIN_API_BASE}/bodyBattery/${startDate}/${endDate}`
    
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    if (!resp.ok) {
      throw new Error(`Garmin body battery API error: ${resp.status}`)
    }

    return await resp.json()
  }

  /**
   * Fetch hydration data
   */
  async function fetchHydrationData(startDate, endDate, accessToken) {
    const url = `${GARMIN_API_BASE}/hydrationData/${startDate}/${endDate}`
    
    const resp = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json'
      }
    })

    if (!resp.ok) {
      throw new Error(`Garmin hydration API error: ${resp.status}`)
    }

    return await resp.json()
  }

  /**
   * Parse Garmin sleep data to biometrics format
   */
  function parseGarminSleep(sleepData, date) {
    if (!sleepData || !sleepData.sleepScores) return null
    
    const entry = sleepData.sleepScores.find(s => s.date === date)
    if (!entry) return null

    const segments = entry.sleepTimeSegments || []
    
    const totalSleep = segments.reduce((sum, s) => sum + (s.duration || 0), 0)
    const deepSleep = segments
      .filter(s => s.type === 'DEEP')
      .reduce((sum, s) => sum + (s.duration || 0), 0)
    const remSleep = segments
      .filter(s => s.type === 'REM')
      .reduce((sum, s) => sum + (s.duration || 0), 0)

    return {
      entry_date: date,
      garmin_sleep_minutes: totalSleep,
      garmin_sleep_deep_minutes: deepSleep,
      garmin_sleep_rem_minutes: remSleep,
      garmin_sleep_light_minutes: totalSleep - deepSleep - remSleep,
      garmin_respiratory_rate: entry.respirationRateMean || null,
      source: 'garmin'
    }
  }

  /**
   * Parse Garmin stress data
   */
  function parseGarminStress(stressData, date) {
    if (!stressData || !stressData.stressScores) return null
    
    const entry = stressData.stressScores.find(s => s.date === date)
    if (!entry) return null

    return {
      entry_date: date,
      garmin_stress_score: entry.stressScore || null,
      garmin_overall_achieve_score: entry.overallAchievementScore || null
    }
  }

  /**
   * Parse Garmin body battery data
   */
  function parseGarminBodyBattery(batteryData, date) {
    if (!batteryData || !batteryData.bodyBatteryReadings) return null
    
    const readings = batteryData.bodyBatteryReadings.filter(r => r.date === date)
    if (!readings.length) return null

    // Get average charge level
    const avgCharge = readings.reduce((sum, r) => sum + (r.charge || 50), 0) / readings.length
    
    return {
      entry_date: date,
      garmin_body_battery: Math.round(avgCharge)
    }
  }

  /**
   * Full sync for a date range
   */
  async function syncGarminData(startDate, endDate) {
    loading.value = true
    try {
      const { db, user } = useSupabase()
      
      // Get stored credentials
      const { data: integration } = await db
        .from('integrations')
        .select('*')
        .eq('user_id', user.value.id)
        .eq('provider', 'garmin_connect')
        .single()

      if (!integration) {
        throw new Error('Garmin Connect not configured')
      }

      // Check token expiry and refresh if needed
      let accessToken = integration.credentials.access_token
      if (integration.credentials.expires_at && Date.now() > integration.credentials.expires_at) {
        const refreshed = await refreshGarminToken(
          integration.credentials.refresh_token,
          // Need client ID/secret from env or secure storage
        )
        accessToken = refreshed.access_token
        
        // Update stored tokens
        await db.from('integrations').update({
          credentials: {
            ...integration.credentials,
            access_token: accessToken,
            expires_at: Date.now() + refreshed.expires_in * 1000
          }
        }).eq('id', integration.id)
      }

      // Fetch all data types in parallel
      const [sleepData, stressData, batteryData] = await Promise.allSettled([
        fetchSleepData(startDate, endDate, accessToken),
        fetchStressData(startDate, endDate, accessToken),
        fetchBodyBattery(startDate, endDate, accessToken)
      ])

      const results = {
        sleep: sleepData.status === 'fulfilled' ? sleepData.value : null,
        stress: stressData.status === 'fulfilled' ? stressData.value : null,
        battery: batteryData.status === 'fulfilled' ? batteryData.value : null
      }

      // Generate date range
      const dates = []
      const start = new Date(startDate)
      const end = new Date(endDate)
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        dates.push(d.toISOString().split('T')[0])
      }

      // Store all data
      let stored = 0
      for (const date of dates) {
        const entry = {
          entry_date: date,
          ...parseGarminSleep(results.sleep, date),
          ...parseGarminStress(results.stress, date),
          ...parseGarminBodyBattery(results.battery, date),
          source: 'garmin'
        }

        // Only store if we have data
        const hasData = Object.values(entry).some(v => v !== null && v !== date && v !== 'garmin')
        if (hasData) {
          const { error } = await db.from('biometrics').upsert({
            user_id: user.value.id,
            ...entry
          })
          if (!error) stored++
        }
      }

      // Update last sync
      await db.from('integrations').update({
        last_sync: new Date().toISOString()
      }).eq('user_id', user.value.id).eq('provider', 'garmin_connect')

      return { stored, totalDates: dates.length }

    } catch (e) {
      console.error('Garmin sync failed:', e)
      error.value = e.message
      throw e
    } finally {
      loading.value = false
    }
  }

  /**
   * Refresh Garmin OAuth token
   */
  async function refreshGarminToken(refreshToken) {
    // Garmin doesn't have a standard refresh token endpoint like Google
    // You typically need to re-authenticate
    throw new Error('Token refresh not supported - re-authenticate with Garmin Connect')
  }

  /**
   * Disconnect Garmin integration
   */
  async function disconnect() {
    try {
      const { db, user } = useSupabase()
      await db.from('integrations')
        .delete()
        .eq('user_id', user.value.id)
        .eq('provider', 'garmin_connect')
      
      connected.value = false
    } catch (e) {
      console.error('Disconnect failed:', e)
      error.value = e.message
    }
  }

  /**
   * Check connection status
   */
  async function checkConnection() {
    try {
      const { db, user } = useSupabase()
      const { data } = await db
        .from('integrations')
        .select('*')
        .eq('user_id', user.value.id)
        .eq('provider', 'garmin_connect')
        .single()
      
      connected.value = !!data
      return !!data
    } catch {
      connected.value = false
      return false
    }
  }

  return {
    connected,
    loading,
    error,
    
    getAuthUrl,
    exchangeCode,
    syncGarminData,
    disconnect,
    checkConnection,
    
    // Parsers (exported for testing/debugging)
    parseGarminSleep,
    parseGarminStress,
    parseGarminBodyBattery
  }
}

export default useGarminConnect