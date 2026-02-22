<script setup>
import { ref, computed } from 'vue'
import { format, parseISO, addDays } from 'date-fns'

const props = defineProps({
  adaptation: { type: Object, required: true }
})

const emit = defineEmits(['approve', 'reject'])

const showChanges = ref(false)

const ws = computed(() => props.adaptation?.weekSummary || {})
const weekStart = computed(() => {
  const d = props.adaptation?.weekStart
  return d ? (typeof d === 'string' ? parseISO(d) : d) : new Date()
})
const weekEnd = computed(() => addDays(weekStart.value, 6))
const weekNumber = computed(() => {
  const d = weekStart.value
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d - start) / 86400000 + start.getDay() + 1) / 7)
})

const dateRange = computed(() =>
  `${format(weekStart.value, 'MMM d')}-${format(weekEnd.value, 'd')}`
)

// TSB bar: map TSB from -30..+20 to 0..100%
const tsbPercent = computed(() => {
  const v = ws.value.tsb || 0
  return Math.max(0, Math.min(100, ((v + 30) / 50) * 100))
})
const tsbColor = computed(() => {
  const v = ws.value.tsb || 0
  if (v > 10) return 'bg-green-500'
  if (v >= 0) return 'bg-green-400'
  if (v >= -10) return 'bg-yellow-500'
  if (v >= -20) return 'bg-orange-500'
  return 'bg-red-500'
})

// Load bar: ratio mapped to 0..100%
const loadPercent = computed(() => Math.min(100, Math.round((ws.value.loadRatio || 0) * 100)))
const loadColor = computed(() => {
  const r = ws.value.loadRatio || 0
  if (r >= 0.8 && r <= 1.2) return 'bg-green-500'
  if (r < 0.8) return 'bg-yellow-500'
  return 'bg-red-500'
})
const loadLabel = computed(() => {
  const r = ws.value.loadRatio || 0
  if (r >= 0.8 && r <= 1.2) return 'On track'
  if (r < 0.8) return 'Under-trained'
  return 'Over-trained'
})
</script>

<template>
  <div class="card border border-border overflow-hidden">
    <!-- Header -->
    <div class="flex items-center justify-between px-4 py-3 bg-bg-tertiary border-b border-border">
      <div class="flex items-center gap-2">
        <span class="text-lg">📊</span>
        <span class="font-semibold text-text-primary">WEEK {{ weekNumber }} RECAP</span>
      </div>
      <span class="text-sm text-text-muted">{{ dateRange }}</span>
    </div>

    <!-- Metrics row -->
    <div class="grid grid-cols-4 gap-2 px-4 py-3 text-center border-b border-border">
      <div>
        <p class="text-lg font-bold text-text-primary">{{ ws.totalDistance || '0km' }}</p>
        <p class="text-xs text-text-muted">Distance</p>
      </div>
      <div>
        <p class="text-lg font-bold text-text-primary">{{ ws.totalElevation || '0m' }}↑</p>
        <p class="text-xs text-text-muted">Elevation</p>
      </div>
      <div>
        <p class="text-lg font-bold text-text-primary">{{ ws.actualLoad || 0 }}</p>
        <p class="text-xs text-text-muted">Load</p>
      </div>
      <div>
        <p class="text-lg font-bold text-text-primary">
          {{ ws.keySessionsCompleted || 0 }}/{{ ws.keySessionsPlanned || 0 }}
        </p>
        <p class="text-xs text-text-muted">Sessions</p>
      </div>
    </div>

    <!-- Bars -->
    <div class="px-4 py-3 space-y-3 border-b border-border">
      <!-- Form (TSB) -->
      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-text-muted w-12 shrink-0">FORM</span>
        <div class="flex-1 h-3 rounded-full bg-bg-tertiary overflow-hidden">
          <div :class="['h-full rounded-full transition-all', tsbColor]" :style="{ width: tsbPercent + '%' }"></div>
        </div>
        <span class="text-xs text-text-muted w-40 text-right shrink-0 capitalize">
          {{ ws.tsbStatus || 'unknown' }} ({{ ws.tsb || 0 }} TSB)
        </span>
      </div>
      <!-- Load -->
      <div class="flex items-center gap-3">
        <span class="text-xs font-semibold text-text-muted w-12 shrink-0">LOAD</span>
        <div class="flex-1 h-3 rounded-full bg-bg-tertiary overflow-hidden">
          <div :class="['h-full rounded-full transition-all', loadColor]" :style="{ width: loadPercent + '%' }"></div>
        </div>
        <span class="text-xs text-text-muted w-40 text-right shrink-0">
          {{ loadLabel }} ({{ loadPercent }}% of plan)
        </span>
      </div>
    </div>

    <!-- Summary message -->
    <div class="px-4 py-3">
      <div class="flex items-start gap-2">
        <span class="text-sm">⚡</span>
        <p class="text-sm text-text-primary flex-1">{{ adaptation.summary }}</p>
      </div>

      <!-- Changes toggle -->
      <div v-if="adaptation.changes && adaptation.changes.length > 0" class="mt-3">
        <button
          @click="showChanges = !showChanges"
          class="text-xs text-accent-primary hover:underline"
        >
          {{ showChanges ? 'Hide changes' : 'See changes' }} ({{ adaptation.changes.length }})
        </button>

        <div v-if="showChanges" class="mt-2 space-y-2">
          <div
            v-for="change in adaptation.changes"
            :key="change.id"
            class="p-2 rounded bg-bg-tertiary text-sm"
          >
            <p class="font-medium text-text-primary">
              {{ change.from?.sessionType }}
              <span v-if="change.to?.sessionType && change.to.sessionType !== change.from?.sessionType">
                → {{ change.to.sessionType }}
              </span>
            </p>
            <p v-if="change.from?.plannedDuration !== change.to?.plannedDuration" class="text-xs text-text-muted">
              {{ change.from?.plannedDuration }} → {{ change.to?.plannedDuration }}
            </p>
            <p class="text-xs text-text-muted mt-1">{{ change.reasonText }}</p>
          </div>

          <div class="flex gap-2 pt-2">
            <button @click="$emit('approve')" class="btn-primary text-sm">Accept changes</button>
            <button @click="$emit('reject')" class="btn-ghost text-sm text-text-muted">Dismiss</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
