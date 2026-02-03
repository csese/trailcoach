import { createClient } from '@supabase/supabase-js'
import { ref, computed } from 'vue'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Create Supabase client (singleton)
let supabase = null

// Shared state (module-level so it's shared across all components)
const user = ref(null)
const loading = ref(true)

export function useSupabase() {
  // Initialize client if not already done
  if (!supabase && supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      }
    })
  }

  const isConfigured = computed(() => !!supabaseUrl && !!supabaseAnonKey && supabaseUrl !== 'https://your-project.supabase.co')

  // Get current user
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

  // Sign up with email
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

  // Sign in with email
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

  // Sign out
  async function signOut() {
    if (!supabase) throw new Error('Supabase not configured')

    const { error } = await supabase.auth.signOut()
    if (error) throw error
    user.value = null
  }

  // Listen for auth changes
  function onAuthStateChange(callback) {
    if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } }

    return supabase.auth.onAuthStateChange((event, session) => {
      user.value = session?.user || null
      callback(event, session)
    })
  }

  // Database helpers
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

    async upsertWorkouts(workouts) {
      if (!supabase || !user.value) return

      const workoutsWithUser = workouts.map(w => ({
        ...w,
        user_id: user.value.id
      }))

      const { data, error } = await supabase
        .from('workouts')
        .upsert(workoutsWithUser, { onConflict: 'id' })
        .select()

      if (error) throw error
      return data
    },

    async importWorkouts(workouts) {
      if (!supabase || !user.value) return

      // Delete existing workouts first
      await supabase
        .from('workouts')
        .delete()
        .eq('user_id', user.value.id)

      // Insert new workouts
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

      // Check if log exists
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
        rpe: logData.rpe,
        notes: logData.notes,
        external_link: logData.externalLink,
        strava_activity_id: logData.stravaActivityId,
        felt_vs_planned: logData.feltVsPlanned,
        pain: logData.pain,
        terrain: logData.terrain,
        conditions: logData.conditions,
        fueling: logData.fueling,
        issues: logData.issues,
        avg_pace: logData.avgPace,
        max_hr: logData.maxHr,
        training_load: logData.trainingLoad,
        relative_effort: logData.relativeEffort,
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

    // Workout Date Overrides (for swapping workouts between days)
    async getDateOverrides() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('workout_date_overrides')
        .select('*')
        .eq('user_id', user.value.id)

      if (error) throw error
      return data || []
    },

    async saveDateOverride(workoutId, customDate) {
      if (!supabase || !user.value) return

      const { data, error } = await supabase
        .from('workout_date_overrides')
        .upsert({
          user_id: user.value.id,
          workout_id: workoutId,
          custom_date: customDate instanceof Date
            ? customDate.toISOString().split('T')[0]
            : customDate,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,workout_id' })
        .select()

      if (error) throw error
      return data[0]
    },

    async saveDateOverrides(overrides) {
      if (!supabase || !user.value || !overrides.length) return

      const overridesWithUser = overrides.map(o => ({
        user_id: user.value.id,
        workout_id: o.workoutId,
        custom_date: o.date instanceof Date
          ? o.date.toISOString().split('T')[0]
          : o.date,
        updated_at: new Date().toISOString()
      }))

      const { data, error } = await supabase
        .from('workout_date_overrides')
        .upsert(overridesWithUser, { onConflict: 'user_id,workout_id' })
        .select()

      if (error) throw error
      return data
    },

    async clearDateOverrides() {
      if (!supabase || !user.value) return

      const { error } = await supabase
        .from('workout_date_overrides')
        .delete()
        .eq('user_id', user.value.id)

      if (error) throw error
    },

    // Workout Overrides (date + content)
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
    },

    // Readiness Entries
    async getReadinessEntries() {
      if (!supabase || !user.value) return []

      const { data, error } = await supabase
        .from('readiness_entries')
        .select('*')
        .eq('user_id', user.value.id)
        .order('entry_date', { ascending: false })

      if (error) throw error
      return data || []
    },

    async saveReadinessEntry(entry) {
      if (!supabase || !user.value) return

      const payload = {
        user_id: user.value.id,
        entry_date: entry.date,
        sleep: entry.sleep,
        soreness: entry.soreness,
        stress: entry.stress,
        mood: entry.mood,
        motivation: entry.motivation,
        pain: entry.pain,
        notes: entry.notes,
        readiness_score: entry.readinessScore
      }

      const { data, error } = await supabase
        .from('readiness_entries')
        .upsert(payload, { onConflict: 'user_id,entry_date' })
        .select()

      if (error) throw error
      return data[0]
    },

    // Adaptation Proposals
    async getAdaptationProposals() {
      if (!supabase || !user.value) return []

      const { data: proposals, error } = await supabase
        .from('adaptation_proposals')
        .select('*')
        .eq('user_id', user.value.id)
        .order('created_at', { ascending: false })

      if (error) throw error
      return proposals || []
    },

    async getAdaptationChanges(proposalIds) {
      if (!supabase || !user.value || !proposalIds?.length) return []

      const { data, error } = await supabase
        .from('adaptation_changes')
        .select('*')
        .in('proposal_id', proposalIds)

      if (error) throw error
      return data || []
    },

    async saveAdaptationProposal(proposal) {
      if (!supabase || !user.value) return null

      const { data, error } = await supabase
        .from('adaptation_proposals')
        .insert({
          user_id: user.value.id,
          week_start: proposal.weekStart,
          window_days: proposal.windowDays,
          status: proposal.status,
          summary: proposal.summary,
          algorithm_version: proposal.algorithmVersion || 'v1',
          signals_json: proposal.signals || {}
        })
        .select()

      if (error) throw error
      return data[0]
    },

    async saveAdaptationChanges(changes) {
      if (!supabase || !user.value || !changes?.length) return

      const payload = changes.map(change => ({
        proposal_id: change.proposalId,
        workout_id: change.workoutId,
        change_type: change.changeType,
        from_state: change.from,
        to_state: change.to,
        reason_code: change.reasonCode,
        reason_text: change.reasonText
      }))

      const { data, error } = await supabase
        .from('adaptation_changes')
        .insert(payload)
        .select()

      if (error) throw error
      return data
    },

    async updateAdaptationProposalStatus(proposalId, status) {
      if (!supabase || !user.value) return

      const { data, error } = await supabase
        .from('adaptation_proposals')
        .update({ status })
        .eq('id', proposalId)
        .select()

      if (error) throw error
      return data[0]
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
