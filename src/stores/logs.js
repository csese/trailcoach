import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useLogsStore = defineStore('logs', () => {
  // State - workout logs (actual data)
  const logs = ref([])
  const loading = ref(false)

  // Load logs from localStorage (for now, will use Supabase later)
  function loadLogs() {
    const stored = localStorage.getItem('trailcoach-logs')
    if (stored) {
      logs.value = JSON.parse(stored)
    }
  }

  // Save logs to localStorage
  function saveLogs() {
    localStorage.setItem('trailcoach-logs', JSON.stringify(logs.value))
  }

  // Add or update a workout log
  function saveLog(workoutId, logData) {
    const existingIndex = logs.value.findIndex(l => l.workoutId === workoutId)

    const log = {
      id: existingIndex >= 0 ? logs.value[existingIndex].id : `log-${Date.now()}`,
      workoutId,
      ...logData,
      completedAt: new Date().toISOString()
    }

    if (existingIndex >= 0) {
      logs.value[existingIndex] = log
    } else {
      logs.value.push(log)
    }

    saveLogs()
    return log
  }

  // Get log for a workout
  function getLogByWorkoutId(workoutId) {
    return logs.value.find(l => l.workoutId === workoutId)
  }

  // Check if workout is completed
  function isCompleted(workoutId) {
    return logs.value.some(l => l.workoutId === workoutId)
  }

  // Delete a log
  function deleteLog(workoutId) {
    logs.value = logs.value.filter(l => l.workoutId !== workoutId)
    saveLogs()
  }

  // Stats
  const completedCount = computed(() => logs.value.length)

  const totalActualDuration = computed(() => {
    return logs.value.reduce((sum, log) => sum + (log.actualDuration || 0), 0)
  })

  const totalActualDistance = computed(() => {
    return logs.value.reduce((sum, log) => sum + (log.actualDistance || 0), 0)
  })

  const totalActualElevation = computed(() => {
    return logs.value.reduce((sum, log) => sum + (log.actualElevation || 0), 0)
  })

  const averageRpe = computed(() => {
    const logsWithRpe = logs.value.filter(l => l.rpe)
    if (logsWithRpe.length === 0) return 0
    return logsWithRpe.reduce((sum, l) => sum + l.rpe, 0) / logsWithRpe.length
  })

  return {
    logs,
    loading,
    loadLogs,
    saveLog,
    getLogByWorkoutId,
    isCompleted,
    deleteLog,
    completedCount,
    totalActualDuration,
    totalActualDistance,
    totalActualElevation,
    averageRpe
  }
})
