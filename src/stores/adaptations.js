import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { format, startOfWeek } from 'date-fns'
import { generateAdaptationProposal } from '@/utils/adaptationEngine'
import { enhanceAdaptationNarrative } from '@/utils/llmNarrator'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useReadinessStore } from '@/stores/readiness'
import { useSupabase } from '@/composables/useSupabase'

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

  return {
    proposals,
    loading,
    pendingProposal,
    approvedProposals,
    loadProposals,
    ensureWeeklyProposal,
    generateProposal,
    approveProposal,
    rejectProposal
  }
})
