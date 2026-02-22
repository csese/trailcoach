import { ref, computed } from 'vue'
import { useSupabase } from './useSupabase'
import { formatPaceMinPerKm } from '@/utils/duration'

const STORAGE_KEY = 'trailcoach-strava-tokens'

function saveTokensLocally(tokens) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens))
}

function loadTokensLocally() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function clearTokensLocally() {
  localStorage.removeItem(STORAGE_KEY)
}

const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize'
const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'
const STRAVA_API_URL = 'https://www.strava.com/api/v3'

// Shared state (module-level so it's shared across all components)
const loading = ref(false)
const error = ref(null)
const activities = ref([])
const isConnected = ref(false)
const athlete = ref(null)

export function useStrava() {
  const { db, user } = useSupabase()

  const clientId = import.meta.env.VITE_STRAVA_CLIENT_ID
  const clientSecret = import.meta.env.VITE_STRAVA_CLIENT_SECRET
  const redirectUri = import.meta.env.VITE_STRAVA_REDIRECT_URI

  const isConfigured = computed(() => !!clientId && !!clientSecret)

  // Generate OAuth URL for Strava authorization
  function getAuthUrl() {
    if (!clientId) {
      throw new Error('Strava client ID not configured')
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'read,activity:read_all',
      approval_prompt: 'auto'
    })

    return `${STRAVA_AUTH_URL}?${params.toString()}`
  }

  // Start OAuth flow
  function authorize() {
    const url = getAuthUrl()
    window.location.href = url
  }

  // Exchange authorization code for tokens
  async function exchangeToken(code) {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(STRAVA_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code: code,
          grant_type: 'authorization_code'
        })
      })

      if (!response.ok) {
        throw new Error('Failed to exchange token')
      }

      const data = await response.json()

      // Save tokens to user settings
      const tokenData = {
        strava_access_token: data.access_token,
        strava_refresh_token: data.refresh_token,
        strava_token_expires_at: new Date(data.expires_at * 1000).toISOString(),
        strava_athlete_id: data.athlete?.id?.toString()
      }
      await db.saveSettings(tokenData)
      saveTokensLocally(tokenData)

      athlete.value = data.athlete
      isConnected.value = true

      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // Refresh access token if expired
  async function refreshToken(refreshToken) {
    const response = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      })
    })

    if (!response.ok) {
      throw new Error('Failed to refresh token')
    }

    const data = await response.json()

    // Update tokens in settings
    const refreshData = {
      strava_access_token: data.access_token,
      strava_refresh_token: data.refresh_token,
      strava_token_expires_at: new Date(data.expires_at * 1000).toISOString()
    }
    await db.saveSettings(refreshData)
    saveTokensLocally({ ...loadTokensLocally(), ...refreshData })

    return data.access_token
  }

  // Get valid access token (refresh if needed)
  async function getValidToken() {
    let settings = await db.getSettings()
    if (!settings?.strava_access_token) {
      settings = loadTokensLocally()
    }
    if (!settings?.strava_access_token) {
      throw new Error('Not connected to Strava')
    }

    const expiresAt = new Date(settings.strava_token_expires_at)
    const now = new Date()

    // Refresh if token expires in less than 5 minutes
    if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      return await refreshToken(settings.strava_refresh_token)
    }

    return settings.strava_access_token
  }

  // Check if connected to Strava
  async function checkConnection() {
    try {
      let settings = await db.getSettings()
      if (!settings?.strava_access_token) {
        settings = loadTokensLocally()
      }
      isConnected.value = !!settings?.strava_access_token
      if (settings?.strava_athlete_id) {
        athlete.value = { id: settings.strava_athlete_id }
      }
      return isConnected.value
    } catch {
      const local = loadTokensLocally()
      isConnected.value = !!local?.strava_access_token
      return isConnected.value
    }
  }

  // Disconnect from Strava
  async function disconnect() {
    try {
      const token = await getValidToken()

      // Deauthorize on Strava
      await fetch('https://www.strava.com/oauth/deauthorize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
    } catch {
      // Continue even if deauthorization fails
    }

    // Clear tokens from settings
    await db.saveSettings({
      strava_access_token: null,
      strava_refresh_token: null,
      strava_token_expires_at: null,
      strava_athlete_id: null
    })

    clearTokensLocally()
    isConnected.value = false
    athlete.value = null
    activities.value = []
  }

  // Fetch activities from Strava
  async function fetchActivities(options = {}) {
    loading.value = true
    error.value = null

    try {
      const token = await getValidToken()

      const params = new URLSearchParams({
        per_page: options.perPage || 30,
        page: options.page || 1
      })

      if (options.after) {
        params.append('after', Math.floor(new Date(options.after).getTime() / 1000))
      }

      if (options.before) {
        params.append('before', Math.floor(new Date(options.before).getTime() / 1000))
      }

      const response = await fetch(`${STRAVA_API_URL}/athlete/activities?${params}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        if (response.status === 401) {
          isConnected.value = false
          throw new Error('Strava authorization expired. Please reconnect.')
        }
        throw new Error('Failed to fetch activities')
      }

      const data = await response.json()
      activities.value = data

      // Save to database
      if (data.length > 0) {
        await db.saveStravaActivities(data)
      }

      return data
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  // Get athlete profile
  async function fetchAthlete() {
    try {
      const token = await getValidToken()

      const response = await fetch(`${STRAVA_API_URL}/athlete`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch athlete')
      }

      const data = await response.json()
      athlete.value = data
      return data
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  // Get single activity details
  async function getActivity(activityId) {
    try {
      const token = await getValidToken()

      const response = await fetch(`${STRAVA_API_URL}/activities/${activityId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error('Failed to fetch activity')
      }

      return await response.json()
    } catch (err) {
      error.value = err.message
      throw err
    }
  }

  // Import activity data to workout log
  async function importActivityToWorkout(stravaActivity, workoutId) {
    // Convert Strava activity to workout log format
    const avgPace = formatPaceMinPerKm(stravaActivity.average_speed)
    const trainingLoad = stravaActivity.suffer_score || stravaActivity.training_load || null
    const relativeEffort = stravaActivity.relative_effort || null
    const logData = {
      actualDuration: Math.round(stravaActivity.moving_time / 60), // seconds to minutes
      actualHrAvg: stravaActivity.average_heartrate ? Math.round(stravaActivity.average_heartrate) : null,
      actualDistance: stravaActivity.distance ? stravaActivity.distance / 1000 : null, // meters to km
      actualElevation: stravaActivity.total_elevation_gain ? Math.round(stravaActivity.total_elevation_gain) : null,
      avgPace,
      maxHr: stravaActivity.max_heartrate ? Math.round(stravaActivity.max_heartrate) : null,
      trainingLoad,
      relativeEffort,
      externalLink: `https://www.strava.com/activities/${stravaActivity.id}`,
      stravaActivityId: stravaActivity.id.toString(),
      notes: `Imported from Strava: ${stravaActivity.name}`
    }

    // Save the log
    await db.saveLog(workoutId, logData)

    // Link the activity to the workout
    await db.linkStravaActivity(stravaActivity.id, workoutId)

    return logData
  }

  // Find matching activities for a workout date
  function findMatchingActivities(workoutDate, workoutType) {
    if (!activities.value.length) return []

    const targetDate = new Date(workoutDate)
    targetDate.setHours(0, 0, 0, 0)

    return activities.value.filter(activity => {
      const activityDate = new Date(activity.start_date_local || activity.start_date)
      activityDate.setHours(0, 0, 0, 0)

      // Match by date
      if (activityDate.getTime() !== targetDate.getTime()) return false

      // Optionally filter by type
      const activityType = activity.type?.toLowerCase() || activity.sport_type?.toLowerCase()

      if (workoutType === 'strength') {
        return activityType === 'weighttraining' || activityType === 'workout'
      }

      if (workoutType === 'easy' || workoutType === 'long' || workoutType === 'tempo' || workoutType === 'intervals') {
        return activityType === 'run' || activityType === 'trail run' || activityType === 'trailrun'
      }

      if (workoutType === 'recovery') {
        return activityType === 'run' || activityType === 'ride' || activityType === 'walk'
      }

      return true
    })
  }

  // ── Weekly Adaptation: Stream & Analysis Functions ──

  /**
   * Fetch time-series streams for a single activity.
   * Only call for runs > 30 min to conserve API quota.
   */
  async function fetchActivityStreams(activityId) {
    try {
      const token = await getValidToken()
      const keys = 'heartrate,velocity_smooth,distance,altitude,grade_smooth'
      const response = await fetch(
        `${STRAVA_API_URL}/activities/${activityId}/streams?keys=${keys}&key_by_type=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (!response.ok) {
        if (response.status === 404) return null // no streams available
        throw new Error('Failed to fetch activity streams')
      }
      const data = await response.json()
      // Strava returns an array of stream objects; convert to keyed map
      const streams = {}
      const keyMap = { heartrate: 'heartrate', velocity_smooth: 'velocity', distance: 'distance', altitude: 'altitude', grade_smooth: 'grade' }
      if (Array.isArray(data)) {
        for (const s of data) {
          const mapped = keyMap[s.type]
          if (mapped) streams[mapped] = s.data
        }
      } else {
        // key_by_type format
        for (const [k, v] of Object.entries(data)) {
          const mapped = keyMap[k]
          if (mapped && v?.data) streams[mapped] = v.data
        }
      }
      return streams
    } catch (err) {
      error.value = err.message
      console.warn('fetchActivityStreams error:', err)
      return null
    }
  }

  /**
   * Aerobic decoupling: how much pace:HR ratio drifts between first and second half.
   * Positive = drifting (fatiguing). <5% excellent, 5-10% moderate, >10% significant.
   */
  function calculateDecoupling(streams) {
    if (!streams?.heartrate?.length || !streams?.velocity?.length || !streams?.distance?.length) return null
    const n = streams.distance.length
    const totalDist = streams.distance[n - 1]
    const halfDist = totalDist / 2

    let splitIdx = 0
    for (let i = 0; i < n; i++) {
      if (streams.distance[i] >= halfDist) { splitIdx = i; break }
    }
    if (splitIdx < 2 || splitIdx >= n - 2) return null

    const avgRatio = (velocities, heartrates, start, end) => {
      let sumV = 0, sumHR = 0, count = 0
      for (let i = start; i < end; i++) {
        if (heartrates[i] > 0) {
          sumV += velocities[i]
          sumHR += heartrates[i]
          count++
        }
      }
      if (count === 0 || sumHR === 0) return 0
      return (sumV / count) / (sumHR / count)
    }

    const firstRatio = avgRatio(streams.velocity, streams.heartrate, 0, splitIdx)
    const secondRatio = avgRatio(streams.velocity, streams.heartrate, splitIdx, n)

    if (firstRatio === 0) return null
    return Math.round(((firstRatio - secondRatio) / firstRatio) * 1000) / 10
  }

  /**
   * Calculate % time spent in each HR zone.
   * hrZones: { z1: [min, max], z2: [min, max], ... z5: [min, max] }
   */
  function calculateZoneDistribution(streams, hrZones) {
    if (!streams?.heartrate?.length || !hrZones) return null
    const counts = { z1: 0, z2: 0, z3: 0, z4: 0, z5: 0 }
    const total = streams.heartrate.length

    for (const hr of streams.heartrate) {
      if (hrZones.z5 && hr >= hrZones.z5[0]) counts.z5++
      else if (hrZones.z4 && hr >= hrZones.z4[0]) counts.z4++
      else if (hrZones.z3 && hr >= hrZones.z3[0]) counts.z3++
      else if (hrZones.z2 && hr >= hrZones.z2[0]) counts.z2++
      else counts.z1++
    }

    return {
      z1: Math.round((counts.z1 / total) * 100),
      z2: Math.round((counts.z2 / total) * 100),
      z3: Math.round((counts.z3 / total) * 100),
      z4: Math.round((counts.z4 / total) * 100),
      z5: Math.round((counts.z5 / total) * 100)
    }
  }

  /**
   * Fetch all activities in a date range, returning a simplified load-oriented list.
   */
  async function fetchWeeklyLoad(weekStartDate, weekEndDate) {
    try {
      const allActivities = await fetchActivities({
        after: weekStartDate,
        before: weekEndDate,
        perPage: 50
      })

      return (allActivities || []).map(a => {
        const sport = (a.sport_type || a.type || '').toLowerCase()
        let type = 'other'
        if (sport.includes('run') || sport.includes('trail')) type = 'run'
        else if (sport.includes('weight') || sport.includes('workout') || sport.includes('crossfit')) type = 'strength'

        return {
          id: a.id,
          date: a.start_date_local || a.start_date,
          name: a.name,
          sport_type: a.sport_type || a.type,
          distance: a.distance ? Math.round(a.distance) : 0,
          duration: a.moving_time || 0,
          elevation_gain: a.total_elevation_gain ? Math.round(a.total_elevation_gain) : 0,
          avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : null,
          suffer_score: a.suffer_score || null,
          relative_effort: a.relative_effort || null,
          perceived_exertion: a.perceived_exertion || null,
          type
        }
      })
    } catch (err) {
      error.value = err.message
      return []
    }
  }

  return {
    isConfigured,
    isConnected,
    loading,
    error,
    activities,
    athlete,
    authorize,
    exchangeToken,
    checkConnection,
    disconnect,
    fetchActivities,
    fetchAthlete,
    getActivity,
    importActivityToWorkout,
    findMatchingActivities,
    fetchActivityStreams,
    calculateDecoupling,
    calculateZoneDistribution,
    fetchWeeklyLoad
  }
}
