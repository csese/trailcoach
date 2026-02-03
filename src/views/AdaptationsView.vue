<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { useAdaptationsStore } from '@/stores/adaptations'
import { useWorkoutsStore } from '@/stores/workouts'
import { format, parseISO } from 'date-fns'
import { CheckCircle2, XCircle, RefreshCw, Sparkles } from 'lucide-vue-next'

const adaptationsStore = useAdaptationsStore()
const workoutsStore = useWorkoutsStore()

const windowDays = ref(14)

onMounted(() => {
  adaptationsStore.loadProposals()
})

const pendingProposal = computed(() => adaptationsStore.pendingProposal)
const approvedProposals = computed(() => adaptationsStore.approvedProposals)

watch(pendingProposal, (proposal) => {
  if (proposal) {
    windowDays.value = proposal.windowDays || 14
  }
}, { immediate: true })

function formatDate(dateStr) {
  if (!dateStr) return ''
  return format(parseISO(dateStr), 'MMM d, yyyy')
}

function getWorkout(change) {
  return workoutsStore.workouts.find(w => w.id === change.workoutId)
}

function summaryLine(state) {
  if (!state) return ''
  const parts = []
  if (state.sessionType) parts.push(state.sessionType)
  if (state.plannedDuration) parts.push(state.plannedDuration)
  if (state.targetHrZone) parts.push(state.targetHrZone)
  return parts.join(' · ')
}

async function approve() {
  if (!pendingProposal.value) return
  await adaptationsStore.approveProposal(pendingProposal.value.id)
}

async function reject() {
  if (!pendingProposal.value) return
  await adaptationsStore.rejectProposal(pendingProposal.value.id)
}

async function regenerate() {
  if (pendingProposal.value) {
    await adaptationsStore.rejectProposal(pendingProposal.value.id)
  }
  await adaptationsStore.generateProposal({ windowDays: windowDays.value })
}
</script>

<template>
  <div class="space-y-6">
    <div class="card">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <Sparkles class="w-5 h-5 text-accent-primary" />
          <div>
            <h2 class="text-lg font-semibold text-text-primary">Plan Adaptations</h2>
            <p class="text-sm text-text-muted">Review and approve weekly plan updates.</p>
          </div>
        </div>
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <label class="text-xs text-text-muted">Window</label>
            <select v-model.number="windowDays" class="input text-sm">
              <option :value="7">7 days</option>
              <option :value="14">14 days</option>
              <option :value="21">21 days</option>
            </select>
          </div>
          <button @click="regenerate" class="btn-secondary flex items-center gap-2">
            <RefreshCw class="w-4 h-4" />
            Regenerate
          </button>
        </div>
      </div>
    </div>

    <div v-if="pendingProposal" class="space-y-4">
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm text-text-muted">Week of {{ formatDate(pendingProposal.weekStart) }}</p>
            <h3 class="text-lg font-semibold text-text-primary">{{ pendingProposal.summary }}</h3>
            <p class="text-xs text-text-muted mt-1">{{ pendingProposal.changes.length }} proposed changes</p>
          </div>
          <div class="flex items-center gap-3">
            <button @click="reject" class="btn-ghost text-status-missed flex items-center gap-2">
              <XCircle class="w-4 h-4" />
              Reject
            </button>
            <button @click="approve" class="btn-primary flex items-center gap-2">
              <CheckCircle2 class="w-4 h-4" />
              Approve
            </button>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card bg-bg-tertiary">
          <p class="text-xs text-text-muted">Readiness avg (3d)</p>
          <p class="text-lg font-semibold text-text-primary">{{ pendingProposal.signals.readinessAvg ?? '—' }}</p>
        </div>
        <div class="card bg-bg-tertiary">
          <p class="text-xs text-text-muted">Recent pain</p>
          <p class="text-lg font-semibold text-text-primary">{{ pendingProposal.signals.recentPain ?? '—' }}</p>
        </div>
        <div class="card bg-bg-tertiary">
          <p class="text-xs text-text-muted">Recent RPE</p>
          <p class="text-lg font-semibold text-text-primary">{{ pendingProposal.signals.recentRpe ?? '—' }}</p>
        </div>
        <div class="card bg-bg-tertiary">
          <p class="text-xs text-text-muted">Load spike</p>
          <p class="text-lg font-semibold text-text-primary">
            {{ pendingProposal.signals.loadSpike ? `${pendingProposal.signals.loadSpike}%` : '—' }}
          </p>
        </div>
      </div>

      <div class="space-y-4">
        <div v-for="change in pendingProposal.changes" :key="change.id" class="card">
          <div class="flex items-start justify-between">
            <div>
              <p class="font-semibold text-text-primary">
                {{ getWorkout(change)?.SessionType || change.from.sessionType || 'Workout' }}
                <span class="text-xs text-text-muted">· {{ formatDate(change.from.date) }}</span>
              </p>
              <p class="text-xs text-text-muted mt-1">{{ change.reasonText }}</p>
            </div>
            <span class="badge bg-accent-primary/20 text-accent-primary text-xs">{{ change.reasonCode }}</span>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
            <div class="card bg-bg-tertiary">
              <p class="text-xs text-text-muted">Before</p>
              <p class="text-sm text-text-primary">{{ summaryLine(change.from) }}</p>
              <p v-if="change.from?.details" class="text-xs text-text-muted mt-1">{{ change.from.details }}</p>
            </div>
            <div class="card bg-bg-tertiary">
              <p class="text-xs text-text-muted">After</p>
              <p class="text-sm text-text-primary">{{ summaryLine(change.to) }}</p>
              <p v-if="change.to?.details" class="text-xs text-text-muted mt-1">{{ change.to.details }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="card">
      <p class="text-text-muted">No pending plan updates right now.</p>
    </div>

    <div class="card" v-if="approvedProposals.length">
      <h3 class="text-lg font-semibold text-text-primary mb-4">Approved History</h3>
      <div class="space-y-3">
        <div v-for="proposal in approvedProposals" :key="proposal.id" class="p-3 rounded-lg bg-bg-tertiary">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm text-text-primary">Week of {{ formatDate(proposal.weekStart) }}</p>
              <p class="text-xs text-text-muted">{{ proposal.summary }}</p>
            </div>
            <span class="text-xs text-text-muted">{{ proposal.changes.length }} changes</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
