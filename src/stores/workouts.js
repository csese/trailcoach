import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { format, parseISO, startOfWeek, endOfWeek, isWithinInterval, addDays } from 'date-fns'
import trainingPlan from '@/data/trainingPlan.json'

export const useWorkoutsStore = defineStore('workouts', () => {
  // State
  const workouts = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Load workouts from JSON
  function loadWorkouts() {
    loading.value = true
    try {
      workouts.value = trainingPlan.map((workout, index) => ({
        ...workout,
        id: `workout-${index}`,
        date: parseWorkoutDate(workout.Week, workout.Dates, workout.Day)
      }))
      error.value = null
    } catch (e) {
      error.value = 'Failed to load training plan'
      console.error(e)
    } finally {
      loading.value = false
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
    getWorkoutsForMonth,
    getWorkoutByDate,
    getWorkoutType
  }
})
