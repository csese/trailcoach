import { createClient } from '@supabase/supabase-js'
import { ref, computed } from 'vue'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabase = null

const user = ref(null)
const loading = ref(true)

export function useSupabase() {
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  }

  const isConfigured = computed(() => !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co')

  async function getUser() {
    if (!supabase) return null

    try {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      user.value = currentUser
      return currentUser
    } catch (error) {
      console.error('Error getting user:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  async function signUp(email, password) {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) throw error
    user.value = data.user
    return data
  }

  async function signIn(email, password) {
    if (!supabase) throw new Error('Supabase not configured')

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) throw error
    user.value = data.user
    return data
  }

  async function signOut() {
    if (!supabase) throw new Error('Supabase not configured')

    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
  }

  function onAuthStateChange(callback) {
    if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } }

    return supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user || null
      callback(event, session)
    })
  }

  const db = {
    // Workouts
    async getWorkouts() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('workouts')
        .select('*')
        .eq('user_id', user.value.id)
        .order('workout_date', { ascending: true })

      if (error) throw error
      return data || []
    },

    async importWorkouts(workouts) {
      if (!supabase || !user.value) return

      await supabase
        .from('workouts')
        .delete()
        .eq('user_id', user.value.id)

      const workoutsWithUser = workouts.map(w => ({
        user_id: user.value.id,
        week: w.Week,
        phase: w.Phase,
        dates: w.Dates,
        day: w.Day,
        session_type: w.SessionType || w['Session Type'],
        planned_duration: w.PlannedDuration || w['Planned Duration'],
        target_hr_zone: w.TargetHRZone || w['Target HR/Zone'],
        details: w.Details,
        workout_description: w.WorkoutDescription || w['Workout Description'],
        focus: w.Focus,
        workout_date: w.date ? w.date.toISOString().split('T')[0] : null
      }))

      const { data, error } = await supabase
        .from('workouts')
        .insert(workoutsWithUser)
        .select()

      if (error) throw error
      return data
    },

    // Workout Logs
    async getLogs() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('workout_logs')
        .select('*')
        .eq('user_id', user.value.id)
        .order('completed_at', { ascending: false })

      if (error) throw error
      return data || []
    },

    async saveLog(workoutId, logData) {
      if (!supabase || !user.value) return

      const { data: existing } = await supabase
        .from('workout_logs')
        .select('id')
        .eq('user_id', user.value.id)
        .eq('workout_id', workoutId)
        .single()

      const log = {
        user_id: user.value.id,
        workout_id: workoutId,
        actual_duration: logData.actualDuration,
        actual_hr_avg: logData.actualHrAvg,
        actual_distance: logData.actualDistance,
        actual_elevation: logData.actualElevation,
        notes: logData.notes,
        external_link: logData.externalLink,
        strava_activity_id: logData.stravaActivityId,
        avg_pace: logData.avgPace,
        max_hr: logData.maxHr,
        completed_at: new Date().toISOString()
      }

      if (existing) {
        const { data, error } = await supabase
          .from('workout_logs')
          .update(log)
          .eq('id', existing.id)
          .select()

        if (error) throw error
        return data[0]
      } else {
        const { data, error } = await supabase
          .from('workout_logs')
          .insert(log)
          .select()

        if (error) throw error
        return data[0]
      }
    },

    async deleteLog(workoutId) {
      if (!supabase || !user.value) return

      const { error } = await supabase
        .from('workout_logs')
        .delete()
        .eq('user_id', user.value.id)
        .eq('workout_id', workoutId)

      if (error) throw error
    },

    // User Settings
    async getSettings() {
      if (!supabase || !user.value) return null

      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.value.id)
        .single()

      if (error && error.code !== 'PGRST116') throw error
      return data
    },

    async saveSettings(settings) {
      if (!supabase || !user.value) return

      const { data, error } = await supabase
        .from('user_settings')
        .upsert({
          user_id: user.value.id,
          ...settings
        }, { onConflict: 'user_id' })
        .select()

      if (error) throw error
      return data[0]
    },

    // Strava Activities
    async getStravaActivities(limit = 50) {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('strava_activities')
        .select('*')
        .eq('user_id', user.value.id)
        .order('start_date', { ascending: false })
        .limit(limit)

      if (error) throw error
      return data || []
    },

    async saveStravaActivities(activities) {
      if (!supabase || !user.value) return

      const activitiesWithUser = activities.map(a => ({
        user_id: user.value.id,
        strava_id: a.id,
        name: a.name,
        type: a.type,
        sport_type: a.sport_type,
        distance: a.distance,
        moving_time: a.moving_time,
        elapsed_time: a.elapsed_time,
        total_elevation_gain: a.total_elevation_gain,
        average_heartrate: a.average_heartrate,
        max_heartrate: a.max_heartrate,
        start_date: a.start_date,
        start_date_local: a.start_date_local,
        summary_polyline: a.map?.summary_polyline,
        raw_data: a
      }))

      const { data, error } = await supabase
        .from('strava_activities')
        .upsert(activitiesWithUser, { onConflict: 'strava_id' })
        .select()

      if (error) throw error
      return data
    },

    async linkStravaActivity(stravaActivityId, workoutId) {
      if (!supabase || !user.value) return

      const { data, error } = await supabase
        .from('strava_activities')
        .update({ linked_workout_id: workoutId })
        .eq('user_id', user.value.id)
        .eq('strava_id', stravaActivityId)
        .select()

      if (error) throw error
      return data[0]
    },

    // Workout Overrides (for swapping workouts)
    async getDateOverrides() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('workout_date_overrides')
        .select('*')
        .eq('user_id', user.value.id)

      if (error) throw error
      return data || []
    },

    async getWorkoutOverrides() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('workout_overrides')
        .select('*')
        .eq('user_id', user.value.id)

      if (error) throw error
      return data || []
    },

    async saveWorkoutOverrides(overrides) {
      if (!supabase || !user.value || !overrides.length) return

      const overridesWithUser = overrides.map(o => ({
        user_id: user.value.id,
        workout_id: o.workoutId,
        custom_date: o.customDate || o.custom_date || null,
        custom_session_type: o.customSessionType || o.custom_session_type || null,
        custom_planned_duration: o.customPlannedDuration || o.custom_planned_duration || null,
        custom_target_hr_zone: o.customTargetHrZone || o.custom_target_hr_zone || null,
        custom_details: o.customDetails || o.custom_details || null,
        custom_focus: o.customFocus || o.custom_focus || null,
        custom_workout_description: o.customWorkoutDescription || o.custom_workout_description || null,
        source: o.source || 'manual',
        updated_at: new Date().toISOString()
      }))

      const { data, error } = await supabase
        .from('workout_overrides')
        .upsert(overridesWithUser, { onConflict: 'user_id,workout_id' })
        .select()

      if (error) throw error
      return data
    },

    async clearWorkoutOverrides() {
      if (!supabase || !user.value) return

      const { error } = await supabase
        .from('workout_overrides')
        .delete()
        .eq('user_id', user.value.id)

      if (error) throw error
    }
  }

  return {
    supabase,
    user,
    loading,
    isConfigured,
    getUser,
    signUp,
    signIn,
    signOut,
    onAuthStateChange,
    db
  }
}
