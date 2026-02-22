import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { format, startOfWeek, subDays, addDays, isMonday, differenceInDays, parseISO } from 'date-fns'
import { generateAdaptationProposal, generateWeeklyAdaptation } from '@/utils/adaptationEngine'
import { enhanceAdaptationNarrative } from '@/utils/llmNarrator'
import { calculateLoadMetrics } from '@/utils/loadCalculator'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useReadinessStore } from '@/stores/readiness'
import { useSupabase } from '@/composables/useSupabase'
import { useStrava } from '@/composables/useStrava'

const STORAGE_KEY = 'trailcoach-adaptations'

function normalizeProposal(proposal) {
  return {
    id: proposal.id || `proposal-${Date.now()}`,
    weekStart: proposal.weekStart || proposal.week_start,
    windowDays: proposal.windowDays || proposal.window_days,
    status: proposal.status || 'pending',
    summary: proposal.summary || '',
    algorithmVersion: proposal.algorithmVersion || proposal.algorithm_version || 'v1',
    createdAt: proposal.createdAt || proposal.created_at || new Date().toISOString(),
    signals: proposal.signals || proposal.signals_json || {},
    changes: proposal.changes || []
  }
}

export const useAdaptationsStore = defineStore('adaptations', () => {
  const proposals = ref([])
  const loading = ref(false)

  const pendingProposal = computed(() => proposals.value.find(p => p.status === 'pending'))
  const approvedProposals = computed(() => proposals.value.filter(p => p.status === 'approved'))

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(proposals.value))
  }

  async function loadProposals() {
    loading.value = true
    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          const supabaseProposals = await db.getAdaptationProposals()
          const proposalIds = supabaseProposals.map(p => p.id)
          const changes = await db.getAdaptationChanges(proposalIds)
          const changesByProposal = changes.reduce((acc, change) => {
            if (!acc[change.proposal_id]) acc[change.proposal_id] = []
            acc[change.proposal_id].push({
              id: change.id,
              workoutId: change.workout_id,
              changeType: change.change_type,
              from: change.from_state,
              to: change.to_state,
              reasonCode: change.reason_code,
              reasonText: change.reason_text,
              override: change.to_state
            })
            return acc
          }, {})

          proposals.value = supabaseProposals.map(p => normalizeProposal({
            ...p,
            changes: changesByProposal[p.id] || []
          }))
          persistLocal()
          return
        }
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      proposals.value = stored ? JSON.parse(stored).map(normalizeProposal) : []
    } catch (error) {
      console.error('Failed to load adaptation proposals:', error)
    } finally {
      loading.value = false
    }
  }

  function getWeekStart(date = new Date()) {
    return format(startOfWeek(date, { weekStartsOn: 1 }), 'yyyy-MM-dd')
  }

  async function ensureWeeklyProposal({ windowDays = 14 } = {}) {
    const boundedWindow = Math.min(21, Math.max(7, windowDays))
    if (!proposals.value.length) {
      await loadProposals()
    }

    const weekStart = getWeekStart()
    const alreadyExists = proposals.value.some(p => p.weekStart === weekStart && p.status !== 'rejected')
    if (alreadyExists) return

    await generateProposal({ windowDays: boundedWindow, weekStart })
  }

  async function generateProposal({ windowDays = 14, weekStart } = {}) {
    const boundedWindow = Math.min(21, Math.max(7, windowDays))
    const workoutsStore = useWorkoutsStore()
    const logsStore = useLogsStore()
    const readinessStore = useReadinessStore()

    const result = generateAdaptationProposal({
      workouts: workoutsStore.workouts,
      logs: logsStore.logs,
      readinessEntries: readinessStore.entries,
      windowDays: boundedWindow,
      getWorkoutType: workoutsStore.getWorkoutType,
      isRaceSpecific: workoutsStore.isRaceSpecific
    })

    const enhancedNarrative = await enhanceAdaptationNarrative({
      summary: result.summary,
      changes: result.changes,
      signals: result.signals
    })

    const enhancedChanges = Array.isArray(enhancedNarrative.changes) ? enhancedNarrative.changes : result.changes
    const originalById = new Map(result.changes.map(change => [change.id, change]))
    const originalByWorkout = new Map(result.changes.map(change => [change.workoutId, change]))
    const mergedChanges = enhancedChanges.map(change => {
      const original = originalById.get(change.id) || originalByWorkout.get(change.workoutId) || change
      return {
        ...original,
        ...change,
        override: original.override || change.override
      }
    })

    const proposal = normalizeProposal({
      id: `proposal-${Date.now()}`,
      weekStart: weekStart || getWeekStart(),
      windowDays: boundedWindow,
      status: 'pending',
      summary: enhancedNarrative.summary || result.summary,
      signals: enhancedNarrative.signals || result.signals,
      changes: mergedChanges
    })

    proposals.value.unshift(proposal)
    persistLocal()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          const saved = await db.saveAdaptationProposal(proposal)
          if (saved?.id) {
            proposal.id = saved.id
            proposal.changes = proposal.changes.map(change => ({
              ...change,
              proposalId: saved.id
            }))
            await db.saveAdaptationChanges(proposal.changes.map(change => ({
              ...change,
              proposalId: saved.id
            })))
            persistLocal()
          }
        }
      }
    } catch (error) {
      console.warn('Failed to save adaptation proposal to Supabase:', error)
    }

    return proposal
  }

  async function approveProposal(proposalId) {
    const proposal = proposals.value.find(p => p.id === proposalId)
    if (!proposal) return

    const workoutsStore = useWorkoutsStore()
    const overrides = proposal.changes.map(change => {
      const override = change.override || {}
      const needsMapping = !override.customSessionType && !override.customPlannedDuration && !override.customDate
      const mapped = needsMapping ? {
        customDate: change.to?.date || null,
        customSessionType: change.to?.sessionType || null,
        customPlannedDuration: change.to?.plannedDuration || null,
        customTargetHrZone: change.to?.targetHrZone || null,
        customDetails: change.to?.details || null,
        customFocus: change.to?.focus || null
      } : override

      return {
        workoutId: change.workoutId,
        ...mapped,
        source: 'adaptation'
      }
    })

    await workoutsStore.saveWorkoutOverrides(overrides)
    proposal.status = 'approved'
    persistLocal()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.updateAdaptationProposalStatus(proposalId, 'approved')
        }
      }
    } catch (error) {
      console.warn('Failed to update adaptation proposal status:', error)
    }
  }

  async function rejectProposal(proposalId) {
    const proposal = proposals.value.find(p => p.id === proposalId)
    if (!proposal) return

    proposal.status = 'rejected'
    persistLocal()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.updateAdaptationProposalStatus(proposalId, 'rejected')
        }
      }
    } catch (error) {
      console.warn('Failed to update adaptation proposal status:', error)
    }
  }

  // ── Weekly Adaptation ──
  const weeklyAdaptation = ref(null)
  const weeklyAdaptationLoading = ref(false)

  const WEEKLY_STORAGE_KEY = 'trailcoach-weekly-adaptation'

  function loadWeeklyAdaptation() {
    try {
      const stored = localStorage.getItem(WEEKLY_STORAGE_KEY)
      if (stored) weeklyAdaptation.value = JSON.parse(stored)
    } catch { /* ignore */ }
  }

  function persistWeeklyAdaptation() {
    if (weeklyAdaptation.value) {
      localStorage.setItem(WEEKLY_STORAGE_KEY, JSON.stringify(weeklyAdaptation.value))
    }
  }

  /**
   * Check if weekly adaptation should run.
   * Runs on Monday or if last adaptation was >6 days ago.
   * Called from DashboardView onMounted.
   */
  async function checkAndRunWeeklyAdaptation() {
    loadWeeklyAdaptation()

    const today = new Date()
    const lastRun = weeklyAdaptation.value?.ranAt
    const daysSinceLastRun = lastRun ? differenceInDays(today, parseISO(lastRun)) : 999

    // Only run on Monday or if >6 days since last run
    if (!isMonday(today) && daysSinceLastRun <= 6) return

    // Don't re-run if already ran today
    if (lastRun && format(parseISO(lastRun), 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return

    weeklyAdaptationLoading.value = true
    try {
      const workoutsStore = useWorkoutsStore()
      const logsStore = useLogsStore()
      const readinessStore = useReadinessStore()
      const strava = useStrava()

      // Last week = Mon-Sun before today
      const lastMonday = subDays(startOfWeek(today, { weekStartsOn: 1 }), 7)
      const lastSunday = addDays(lastMonday, 7)
      const thisMonday = startOfWeek(today, { weekStartsOn: 1 })
      const nextSunday = addDays(thisMonday, 7)

      // Fetch Strava data if connected
      let activities = []
      let streamAnalysis = { decoupling: null, easyRunZoneViolation: false }

      const stravaConnected = await strava.checkConnection()
      if (stravaConnected) {
        try {
          activities = await strava.fetchWeeklyLoad(
            format(lastMonday, 'yyyy-MM-dd'),
            format(lastSunday, 'yyyy-MM-dd')
          )

          // Fetch streams for runs > 30min to analyze decoupling & zones
          const longRuns = activities.filter(a => a.type === 'run' && a.duration > 1800)
          const hrZones = null // TODO: pull from user settings if configured

          for (const run of longRuns.slice(0, 3)) { // limit API calls
            const streams = await strava.fetchActivityStreams(run.id)
            if (streams) {
              // Check decoupling on longest run
              if (run === longRuns.sort((a, b) => b.duration - a.duration)[0]) {
                const dec = strava.calculateDecoupling(streams)
                if (dec != null) streamAnalysis.decoupling = dec
              }

              // Check easy run zone violations
              if (hrZones && run.duration < 3600) { // < 1hr = likely easy
                const zones = strava.calculateZoneDistribution(streams, hrZones)
                if (zones && (zones.z3 + zones.z4 + zones.z5) > 20) {
                  streamAnalysis.easyRunZoneViolation = true
                }
              }
            }
          }
        } catch (err) {
          console.warn('Weekly adaptation: Strava fetch error:', err)
        }
      }

      // Build activity history for ATL/CTL/TSB (last 60 days of logs)
      const activityHistory = logsStore.logs
        .filter(l => l.completedAt)
        .map(l => ({
          date: format(new Date(l.completedAt), 'yyyy-MM-dd'),
          load: l.trainingLoad || l.relativeEffort || Math.round((l.actualDuration || 0) / 6)
        }))

      // Add this week's Strava activities too
      for (const a of activities) {
        activityHistory.push({
          date: format(new Date(a.date), 'yyyy-MM-dd'),
          load: a.suffer_score || a.relative_effort || Math.round((a.duration || 0) / 360)
        })
      }

      const loadMetrics = calculateLoadMetrics(activityHistory)

      // Get planned workouts for last week and upcoming week
      const lastWeekPlanned = workoutsStore.workouts.filter(w => {
        if (!w.date) return false
        return w.date >= lastMonday && w.date < lastSunday
      })
      const upcomingWorkouts = workoutsStore.workouts.filter(w => {
        if (!w.date) return false
        return w.date >= thisMonday && w.date < nextSunday
      })

      // Get readiness entries for last week
      const lastMondayStr = format(lastMonday, 'yyyy-MM-dd')
      const lastSundayStr = format(lastSunday, 'yyyy-MM-dd')
      const legFeelEntries = readinessStore.entries.filter(e =>
        e.date >= lastMondayStr && e.date <= lastSundayStr
      )

      const result = await generateWeeklyAdaptation({
        weekStart: lastMonday,
        activities,
        loadMetrics,
        plannedWorkouts: lastWeekPlanned,
        legFeelEntries,
        upcomingWorkouts,
        hrZones: null,
        streamAnalysis
      })

      weeklyAdaptation.value = {
        ...result,
        weekStart: format(lastMonday, 'yyyy-MM-dd'),
        ranAt: new Date().toISOString(),
        status: result.changes.length > 0 ? 'pending' : 'info'
      }
      persistWeeklyAdaptation()

      // If there are changes, also create a proposal in the normal flow
      if (result.changes.length > 0) {
        const proposal = normalizeProposal({
          id: `weekly-${Date.now()}`,
          weekStart: format(lastMonday, 'yyyy-MM-dd'),
          windowDays: 7,
          status: 'pending',
          summary: result.summary,
          signals: result.signals,
          changes: result.changes
        })
        proposals.value.unshift(proposal)
        persistLocal()
      }
    } catch (err) {
      console.error('Weekly adaptation failed:', err)
    } finally {
      weeklyAdaptationLoading.value = false
    }
  }

  function dismissWeeklyAdaptation() {
    if (weeklyAdaptation.value) {
      weeklyAdaptation.value.status = 'dismissed'
      persistWeeklyAdaptation()
    }
  }

  return {
    proposals,
    loading,
    pendingProposal,
    approvedProposals,
    loadProposals,
    ensureWeeklyProposal,
    generateProposal,
    approveProposal,
    rejectProposal,
    weeklyAdaptation,
    weeklyAdaptationLoading,
    checkAndRunWeeklyAdaptation,
    dismissWeeklyAdaptation
  }
})
