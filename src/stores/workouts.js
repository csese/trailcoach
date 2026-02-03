import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { format, startOfWeek, endOfWeek, isWithinInterval, addDays } from 'date-fns'
import trainingPlan from '@/data/trainingPlan.json'
import { useSupabase } from '@/composables/useSupabase'

export const useWorkoutsStore = defineStore('workouts', () => {
  // State
  const workouts = ref([])
  const loading = ref(false)
  const error = ref(null)
  const dateOverrides = ref({}) // Map of workoutId -> custom date (legacy)
  const workoutOverrides = ref({}) // Map of workoutId -> override fields

  const OVERRIDES_STORAGE_KEY = 'trailcoach-workout-overrides'

  // Load workouts from JSON
  function loadWorkouts() {
    loading.value = true
    try {
      workouts.value = trainingPlan.map((workout, index) => {
        const id = `workout-${index}`
        const originalDate = parseWorkoutDate(workout.Week, workout.Dates, workout.Day)
        const override = workoutOverrides.value[id] || {}
        // Apply any saved date override
        const customDate = override.customDate || dateOverrides.value[id]
        return {
          ...workout,
          id,
          date: customDate ? new Date(customDate) : originalDate,
          originalDate, // Keep original for reference
          // Apply overrides to fields used in UI
          SessionType: override.customSessionType || workout.SessionType,
          PlannedDuration: override.customPlannedDuration || workout.PlannedDuration,
          TargetHRZone: override.customTargetHrZone || workout.TargetHRZone,
          Details: override.customDetails || workout.Details,
          Focus: override.customFocus || workout.Focus,
          WorkoutDescription: override.customWorkoutDescription || workout.WorkoutDescription,
          override
        }
      })
      error.value = null
    } catch (e) {
      error.value = 'Failed to load training plan'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  // Load date overrides from database
  async function loadDateOverrides() {
    try {
      const { db, user } = useSupabase()
      if (!user.value) return

      let overrides = []
      try {
        overrides = await db.getWorkoutOverrides()
      } catch (error) {
        console.warn('Workout overrides table not available, falling back to date overrides.')
        overrides = await db.getDateOverrides()
      }

      // Convert to a map for easy lookup
      workoutOverrides.value = overrides.reduce((acc, o) => {
        acc[o.workout_id] = {
          workoutId: o.workout_id,
          customDate: o.custom_date || null,
          customSessionType: o.custom_session_type || null,
          customPlannedDuration: o.custom_planned_duration || null,
          customTargetHrZone: o.custom_target_hr_zone || null,
          customDetails: o.custom_details || null,
          customFocus: o.custom_focus || null,
          customWorkoutDescription: o.custom_workout_description || null,
          source: o.source || 'manual'
        }
        return acc
      }, {})

      dateOverrides.value = Object.entries(workoutOverrides.value).reduce((acc, [workoutId, override]) => {
        if (override.customDate) acc[workoutId] = override.customDate
        return acc
      }, {})

      persistOverridesLocal()

      // Reload workouts to apply overrides
      loadWorkouts()
    } catch (e) {
      console.error('Failed to load date overrides:', e)
    }
  }

  function loadOverridesFromLocal() {
    const stored = localStorage.getItem(OVERRIDES_STORAGE_KEY)
    workoutOverrides.value = stored ? JSON.parse(stored) : {}
    dateOverrides.value = Object.entries(workoutOverrides.value).reduce((acc, [workoutId, override]) => {
      if (override.customDate) acc[workoutId] = override.customDate
      return acc
    }, {})
  }

  async function loadOverrides() {
    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await loadDateOverrides()
          return
        }
      }
      loadOverridesFromLocal()
      loadWorkouts()
    } catch (error) {
      console.error('Failed to load overrides:', error)
    }
  }

  function persistOverridesLocal() {
    localStorage.setItem(OVERRIDES_STORAGE_KEY, JSON.stringify(workoutOverrides.value))
  }

  async function saveWorkoutOverrides(overrides) {
    if (!overrides?.length) return

    overrides.forEach(override => {
      const normalizedDate = override.customDate instanceof Date
        ? override.customDate.toISOString().split('T')[0]
        : override.customDate

      workoutOverrides.value[override.workoutId] = {
        ...workoutOverrides.value[override.workoutId],
        ...override,
        customDate: normalizedDate
      }

      if (normalizedDate) {
        dateOverrides.value[override.workoutId] = normalizedDate
      }
    })

    const payloadOverrides = overrides.map(override => ({
      ...override,
      customDate: override.customDate instanceof Date
        ? override.customDate.toISOString().split('T')[0]
        : override.customDate
    }))

    persistOverridesLocal()
    loadWorkouts()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.saveWorkoutOverrides(payloadOverrides)
          return
        }
      }
    } catch (error) {
      console.warn('Failed to save workout overrides to Supabase:', error)
    }
  }

  // Parse workout date from week dates and day
  function parseWorkoutDate(week, datesStr, day) {
    // datesStr format: "Jan 6-12" or "Mar 30-Apr 5"
    const dayMap = {
      'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3,
      'Fri': 4, 'Sat': 5, 'Sun': 6
    }

    // Parse the start date from the dates string
    const monthMap = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    }

    const parts = datesStr.split(' ')
    const month = monthMap[parts[0]]
    const startDay = parseInt(parts[1].split('-')[0])

    // Year is 2026 based on the training plan
    const year = 2026
    const weekStart = new Date(year, month, startDay)

    // Add days based on the day of week
    const dayOffset = dayMap[day] || 0
    const workoutDate = addDays(weekStart, dayOffset)

    return workoutDate
  }

  // Getters
  const phases = computed(() => {
    const uniquePhases = [...new Set(workouts.value.map(w => w.Phase))]
    return uniquePhases.map(phase => {
      const phaseWorkouts = workouts.value.filter(w => w.Phase === phase)
      const startDate = phaseWorkouts[0]?.date
      const endDate = phaseWorkouts[phaseWorkouts.length - 1]?.date
      return {
        name: phase,
        startDate,
        endDate,
        workoutCount: phaseWorkouts.length
      }
    })
  })

  const currentPhase = computed(() => {
    const today = new Date()
    return phases.value.find(phase =>
      phase.startDate && phase.endDate &&
      isWithinInterval(today, { start: phase.startDate, end: phase.endDate })
    )
  })

  const currentWeekWorkouts = computed(() => {
    const today = new Date()
    const weekStart = startOfWeek(today, { weekStartsOn: 1 })
    const weekEnd = endOfWeek(today, { weekStartsOn: 1 })

    return workouts.value.filter(w =>
      w.date && isWithinInterval(w.date, { start: weekStart, end: weekEnd })
    )
  })

  const todaysWorkout = computed(() => {
    const today = format(new Date(), 'yyyy-MM-dd')
    return workouts.value.find(w =>
      w.date && format(w.date, 'yyyy-MM-dd') === today
    )
  })

  const nextWorkout = computed(() => {
    const today = new Date()
    return workouts.value
      .filter(w => w.date && w.date > today)
      .sort((a, b) => a.date - b.date)[0]
  })

  // Get workouts for a specific month
  function getWorkoutsForMonth(year, month) {
    return workouts.value.filter(w => {
      if (!w.date) return false
      return w.date.getFullYear() === year && w.date.getMonth() === month
    })
  }

  // Get workout by date
  function getWorkoutByDate(date) {
    const dateStr = format(date, 'yyyy-MM-dd')
    return workouts.value.find(w =>
      w.date && format(w.date, 'yyyy-MM-dd') === dateStr
    )
  }

  // Get workout type category for coloring
  function getWorkoutType(sessionType) {
    const type = sessionType?.toLowerCase() || ''

    if (type.includes('race')) return 'race'
    if (type.includes('rest')) return 'rest'
    if (type.includes('recovery')) return 'recovery'
    if (type.includes('strength')) return 'strength'
    if (type.includes('long run')) return 'long'
    if (type.includes('tempo') || type.includes('threshold') || type.includes('race pace')) return 'tempo'
    if (type.includes('hill') || type.includes('interval') || type.includes('fartlek')) return 'intervals'
    if (type.includes('easy') || type.includes('shakeout')) return 'easy'
    if (type.includes('flexible')) return 'easy'

    return 'easy'
  }

  function isRaceSpecific(workout) {
    if (!workout) return false
    const fields = [
      workout.SessionType,
      workout.Focus,
      workout.Details,
      workout.Phase
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return fields.includes('race') || fields.includes('race-specific') || fields.includes('race week')
  }

  // Swap two workouts' dates
  async function swapWorkouts(workoutId1, workoutId2) {
    const w1 = workouts.value.find(w => w.id === workoutId1)
    const w2 = workouts.value.find(w => w.id === workoutId2)

    if (w1 && w2) {
      const tempDate = w1.date
      w1.date = w2.date
      w2.date = tempDate

      await saveWorkoutOverrides([
        { workoutId: workoutId1, customDate: w1.date.toISOString().split('T')[0], source: 'manual' },
        { workoutId: workoutId2, customDate: w2.date.toISOString().split('T')[0], source: 'manual' }
      ])
    }
  }

  // Move a workout to a specific date (for swapping with rest days)
  async function moveWorkoutToDate(workoutId, newDate) {
    const workout = workouts.value.find(w => w.id === workoutId)
    if (workout) {
      workout.date = newDate

      await saveWorkoutOverrides([
        { workoutId, customDate: newDate instanceof Date ? newDate.toISOString().split('T')[0] : newDate, source: 'manual' }
      ])
    }
  }

  // Reset all date overrides (restore original plan)
  async function resetToOriginalPlan() {
    try {
      const { db, user } = useSupabase()
      if (user.value) {
        try {
          await db.clearWorkoutOverrides()
        } catch (error) {
          await db.clearDateOverrides()
        }
      }

      dateOverrides.value = {}
      workoutOverrides.value = {}
      localStorage.removeItem(OVERRIDES_STORAGE_KEY)
      loadWorkouts()
    } catch (e) {
      console.error('Failed to reset plan:', e)
    }
  }

  return {
    workouts,
    loading,
    error,
    phases,
    currentPhase,
    currentWeekWorkouts,
    todaysWorkout,
    nextWorkout,
    loadWorkouts,
    loadDateOverrides,
    getWorkoutsForMonth,
    getWorkoutByDate,
    getWorkoutType,
    isRaceSpecific,
    swapWorkouts,
    moveWorkoutToDate,
    saveWorkoutOverrides,
    loadOverrides,
    resetToOriginalPlan
  }
})
