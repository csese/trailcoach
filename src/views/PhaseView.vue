<script setup>
import { computed } from 'vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useUserStore } from '@/stores/user'
import { format, isWithinInterval } from 'date-fns'
import { Flag, Calendar, Trophy, ChevronRight } from 'lucide-vue-next'

const workoutsStore = useWorkoutsStore()
const userStore = useUserStore()

const phases = computed(() => workoutsStore.phases)
const races = computed(() => userStore.races)
const today = new Date()

function isCurrentPhase(phase) {
  if (!phase.startDate || !phase.endDate) return false
  return isWithinInterval(today, { start: phase.startDate, end: phase.endDate })
}

function isPastPhase(phase) {
  if (!phase.endDate) return false
  return phase.endDate < today
}

function formatDate(date) {
  if (!date) return ''
  return format(date, 'MMM d')
}

function getPhaseColor(phaseName) {
  if (phaseName.toLowerCase().includes('base')) return 'bg-workout-easy'
  if (phaseName.toLowerCase().includes('balcons')) return 'bg-workout-long'
  if (phaseName.toLowerCase().includes('gypaete')) return 'bg-workout-tempo'
  if (phaseName.toLowerCase().includes('maintenance') || phaseName.toLowerCase().includes('baby')) return 'bg-workout-recovery'
  if (phaseName.toLowerCase().includes('nice')) return 'bg-workout-intervals'
  if (phaseName.toLowerCase().includes('taper')) return 'bg-workout-strength'
  if (phaseName.toLowerCase().includes('race')) return 'bg-workout-race'
  return 'bg-accent-primary'
}

function getRaceForPhase(phase) {
  const phaseLower = phase.name.toLowerCase()
  if (phaseLower.includes('balcons')) return races.value.find(r => r.name.includes('Balcons'))
  if (phaseLower.includes('gypaete')) return races.value.find(r => r.name.includes('Gypaète'))
  if (phaseLower.includes('nice')) return races.value.find(r => r.name.includes('Nice'))
  return null
}
</script>

<template>
  <div class="space-y-6">
    <!-- Timeline Overview -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-6 flex items-center gap-2">
        <Flag class="w-5 h-5 text-text-muted" />
        Training Timeline
      </h2>

      <!-- Visual Timeline -->
      <div class="relative">
        <!-- Timeline bar -->
        <div class="absolute left-6 top-0 bottom-0 w-0.5 bg-border"></div>

        <!-- Phases -->
        <div class="space-y-6">
          <div
            v-for="(phase, index) in phases"
            :key="phase.name"
            class="relative flex gap-4"
          >
            <!-- Timeline dot -->
            <div
              class="relative z-10 w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
              :class="[
                isCurrentPhase(phase)
                  ? 'bg-accent-primary ring-4 ring-accent-primary/30'
                  : isPastPhase(phase)
                    ? 'bg-bg-tertiary border-2 border-status-completed'
                    : 'bg-bg-tertiary border-2 border-border'
              ]"
            >
              <span
                class="font-mono text-sm font-bold"
                :class="isCurrentPhase(phase) ? 'text-white' : 'text-text-muted'"
              >
                {{ index + 1 }}
              </span>
            </div>

            <!-- Phase content -->
            <div
              class="flex-1 card"
              :class="[
                isCurrentPhase(phase)
                  ? 'ring-2 ring-accent-primary border-accent-primary'
                  : isPastPhase(phase)
                    ? 'opacity-60'
                    : ''
              ]"
            >
              <div class="flex items-start justify-between">
                <div>
                  <div class="flex items-center gap-3 mb-2">
                    <div :class="['w-3 h-3 rounded-full', getPhaseColor(phase.name)]"></div>
                    <h3 class="font-semibold text-text-primary">{{ phase.name }}</h3>
                    <span
                      v-if="isCurrentPhase(phase)"
                      class="badge bg-accent-primary/20 text-accent-primary text-xs"
                    >
                      Current
                    </span>
                  </div>

                  <div class="flex items-center gap-4 text-sm text-text-muted">
                    <span class="flex items-center gap-1">
                      <Calendar class="w-4 h-4" />
                      {{ formatDate(phase.startDate) }} - {{ formatDate(phase.endDate) }}
                    </span>
                    <span>{{ phase.workoutCount }} workouts</span>
                  </div>
                </div>

                <!-- Race badge if applicable -->
                <div v-if="getRaceForPhase(phase)" class="text-right">
                  <div class="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-workout-race/10 border border-workout-race/30">
                    <Trophy class="w-4 h-4 text-workout-race" />
                    <span class="text-sm font-medium text-workout-race">
                      {{ getRaceForPhase(phase).name }}
                    </span>
                  </div>
                </div>
              </div>

              <!-- Phase progress bar -->
              <div v-if="isCurrentPhase(phase)" class="mt-4">
                <div class="flex justify-between text-xs text-text-muted mb-1">
                  <span>Progress</span>
                  <span>{{ Math.round(((today - phase.startDate) / (phase.endDate - phase.startDate)) * 100) }}%</span>
                </div>
                <div class="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                  <div
                    class="h-full bg-accent-primary rounded-full transition-all duration-500"
                    :style="{
                      width: `${Math.min(100, Math.max(0, ((today - phase.startDate) / (phase.endDate - phase.startDate)) * 100))}%`
                    }"
                  ></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Races Summary -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Trophy class="w-5 h-5 text-workout-race" />
        Race Calendar
      </h2>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          v-for="race in races"
          :key="race.name"
          class="p-4 rounded-xl border-2 transition-all"
          :class="[
            race.type === 'goal'
              ? 'bg-workout-race/10 border-workout-race'
              : race.type === 'key'
                ? 'bg-workout-tempo/10 border-workout-tempo'
                : 'bg-workout-long/10 border-workout-long'
          ]"
        >
          <div class="flex items-center gap-2 mb-2">
            <span
              class="text-xs font-semibold uppercase tracking-wider"
              :class="[
                race.type === 'goal'
                  ? 'text-workout-race'
                  : race.type === 'key'
                    ? 'text-workout-tempo'
                    : 'text-workout-long'
              ]"
            >
              {{ race.type === 'goal' ? 'Goal Race' : race.type === 'key' ? 'Key Race' : 'Training Race' }}
            </span>
          </div>

          <h3 class="text-xl font-bold text-text-primary">{{ race.name }}</h3>
          <p class="text-text-muted">{{ race.distance }}</p>

          <div class="mt-4 flex items-center justify-between">
            <span class="text-sm text-text-muted">
              {{ format(new Date(race.date), 'MMMM d, yyyy') }}
            </span>
            <span
              class="font-mono font-bold text-lg"
              :class="[
                race.type === 'goal'
                  ? 'text-workout-race'
                  : race.type === 'key'
                    ? 'text-workout-tempo'
                    : 'text-workout-long'
              ]"
            >
              {{ Math.max(0, Math.ceil((new Date(race.date) - today) / (1000 * 60 * 60 * 24))) }}d
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
