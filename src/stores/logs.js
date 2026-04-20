import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useSupabase } from '@/composables/useSupabase'

export const useLogsStore = defineStore('logs', () => {
  const logs = ref([])
  const loading = ref(false)

  function normalizeLog(log) {
    const actualDuration = log.actualDuration ?? log.actual_duration ?? null
    const actualHrAvg = log.actualHrAvg ?? log.actual_hr_avg ?? null
    const actualDistance = log.actualDistance ?? log.actual_distance ?? null
    const actualElevation = log.actualElevation ?? log.actual_elevation ?? null
    const maxHr = log.maxHr || log.max_hr || null

    return {
      id: log.id || `log-${Date.now()}`,
      workoutId: log.workoutId || log.workout_id,
      actualDuration: actualDuration !== null ? Number(actualDuration) : null,
      actualHrAvg: actualHrAvg !== null ? Number(actualHrAvg) : null,
      actualDistance: actualDistance !== null ? Number(actualDistance) : null,
      actualElevation: actualElevation !== null ? Number(actualElevation) : null,
      maxHr: maxHr !== null ? Number(maxHr) : null,
      notes: log.notes || '',
      externalLink: log.externalLink || log.external_link || '',
      stravaActivityId: log.stravaActivityId || log.strava_activity_id || null,
      completedAt: log.completedAt || log.completed_at || new Date().toISOString(),
      avgPace: log.avgPace || log.avg_pace || null
    }
  }

  async function loadLogs() {
    loading.value = true
    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          const data = await db.getLogs()
          logs.value = (data || []).map(normalizeLog)
          saveLogs()
          return
        }
      }

      const stored = localStorage.getItem('trailcoach-logs')
      logs.value = stored ? JSON.parse(stored).map(normalizeLog) : []
    } catch (error) {
      console.error('Failed to load logs:', error)
    } finally {
      loading.value = false
    }
  }

  function saveLogs() {
    localStorage.setItem('trailcoach-logs', JSON.stringify(logs.value))
  }

  async function saveLog(workoutId, logData) {
    const existingIndex = logs.value.findIndex(l => l.workoutId === workoutId)

    const log = normalizeLog({
      id: existingIndex >= 0 ? logs.value[existingIndex].id : `log-${Date.now()}`,
      workoutId,
      ...logData,
      completedAt: new Date().toISOString()
    })

    if (existingIndex >= 0) {
      logs.value[existingIndex] = log
    } else {
      logs.value.push(log)
    }

    saveLogs()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.saveLog(workoutId, log)
        }
      }
    } catch (error) {
      console.warn('Failed to save log to Supabase:', error)
    }

    return log
  }

  function getLogByWorkoutId(workoutId) {
    return logs.value.find(l => l.workoutId === workoutId)
  }

  function isCompleted(workoutId) {
    return logs.value.some(l => l.workoutId === workoutId)
  }

  async function deleteLog(workoutId) {
    logs.value = logs.value.filter(l => l.workoutId !== workoutId)
    saveLogs()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.deleteLog(workoutId)
        }
      }
    } catch (error) {
      console.warn('Failed to delete log from Supabase:', error)
    }
  }

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
    totalActualElevation
  }
})
