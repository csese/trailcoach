<script setup>
import { ref, computed, onMounted } from 'vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useUserStore } from '@/stores/user'
import { useAdaptationsStore } from '@/stores/adaptations'
import { format, differenceInDays, startOfWeek, addDays, isToday } from 'date-fns'
import {
  Calendar,
  Clock,
  Mountain,
  TrendingUp,
  Target,
  Trophy,
  ChevronRight,
  CheckCircle2,
  Circle
} from 'lucide-vue-next'
import WorkoutModal from '@/components/workout/WorkoutModal.vue'

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()
const userStore = useUserStore()
const adaptationsStore = useAdaptationsStore()

onMounted(() => {
  logsStore.loadLogs()
  userStore.loadSettings()
  adaptationsStore.loadProposals()
})

const selectedWorkout = ref(null)
const showModal = ref(false)
const showAdaptationDetails = ref(false)
const adaptationDismissed = ref(false)

// Computed
const currentWeekWorkouts = computed(() => workoutsStore.currentWeekWorkouts)
const todaysWorkout = computed(() => workoutsStore.todaysWorkout)
const nextWorkout = computed(() => workoutsStore.nextWorkout)
const currentPhase = computed(() => workoutsStore.currentPhase)
const races = computed(() => userStore.races)
const pendingProposal = computed(() => adaptationsStore.pendingProposal)

// Full week with all 7 days (including rest days)
const fullWeekDays = computed(() => {
  const today = new Date()
  const weekStart = startOfWeek(today, { weekStartsOn: 1 }) // Monday
  const days = []

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i)
    const workout = workoutsStore.getWorkoutByDate(date)
    days.push({
      date,
      workout,
      isToday: isToday(date),
      isRest: !workout
    })
  }

  return days
})

// Stats
const completionRate = computed(() => {
  const total = workoutsStore.workouts.filter(w => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return w.date && w.date < today
  }).length

  if (total === 0) return 0
  return Math.round((logsStore.completedCount / total) * 100)
})

const totalHours = computed(() => {
  return Math.round(logsStore.totalActualDuration / 60)
})

const totalElevation = computed(() => {
  return logsStore.totalActualElevation
})

// Helpers
function getWorkoutType(sessionType) {
  return workoutsStore.getWorkoutType(sessionType)
}

function isWorkoutCompleted(workout) {
  return logsStore.isCompleted(workout.id)
}

function getDaysUntilRace(dateStr) {
  return differenceInDays(new Date(dateStr), new Date())
}

function selectWorkout(workout) {
  selectedWorkout.value = workout
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  selectedWorkout.value = null
}

function formatWorkoutDate(date) {
  if (!date) return ''
  return format(date, 'EEE, MMM d')
}

function formatDayName(date) {
  if (!date) return ''
  return format(date, 'EEE')
}

const workoutColors = {
  easy: 'bg-workout-easy',
  long: 'bg-workout-long',
  tempo: 'bg-workout-tempo',
  intervals: 'bg-workout-intervals',
  strength: 'bg-workout-strength',
  rest: 'bg-workout-rest',
  race: 'bg-workout-race',
  recovery: 'bg-workout-recovery'
}
</script>

<template>
  <div class="space-y-6">
    <!-- Inline Adaptation Alert -->
    <div v-if="pendingProposal && pendingProposal.changes.length > 0 && !adaptationDismissed" class="card border border-accent-primary/30 bg-accent-primary/10">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <span class="text-lg">⚡</span>
          <span class="font-semibold text-text-primary">Your plan has been adapted</span>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="showAdaptationDetails = !showAdaptationDetails"
            class="btn-secondary text-sm"
          >
            {{ showAdaptationDetails ? 'Hide' : 'View changes' }}
          </button>
          <button
            @click="adaptationDismissed = true; adaptationsStore.rejectProposal(pendingProposal.id)"
            class="btn-ghost text-sm text-text-muted"
          >
            Dismiss
          </button>
        </div>
      </div>
      <div v-if="showAdaptationDetails" class="mt-4 space-y-2 border-t border-border pt-3">
        <div
          v-for="change in pendingProposal.changes"
          :key="change.id"
          class="flex items-start gap-3 p-3 rounded-lg bg-bg-tertiary"
        >
          <div class="flex-1">
            <p class="text-sm font-medium text-text-primary">
              {{ change.from?.sessionType }} → {{ change.to?.sessionType || change.from?.sessionType }}
            </p>
            <p v-if="change.from?.plannedDuration !== change.to?.plannedDuration" class="text-xs text-text-muted">
              Duration: {{ change.from?.plannedDuration }} → {{ change.to?.plannedDuration }}
            </p>
            <p class="text-xs text-text-muted mt-1">{{ change.reasonText }}</p>
          </div>
        </div>
        <div class="flex justify-end pt-2">
          <button
            @click="adaptationsStore.approveProposal(pendingProposal.id); adaptationDismissed = true"
            class="btn-primary text-sm"
          >
            Accept changes
          </button>
        </div>
      </div>
    </div>

    <!-- Stats Overview -->
    <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
      <div class="card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-status-completed/20 flex items-center justify-center">
            <Target class="w-6 h-6 text-status-completed" />
          </div>
          <div>
            <p class="text-sm text-text-muted">Completion</p>
            <p class="stat-number text-status-completed">{{ completionRate }}%</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-workout-long/20 flex items-center justify-center">
            <Clock class="w-6 h-6 text-workout-long" />
          </div>
          <div>
            <p class="text-sm text-text-muted">Total Hours</p>
            <p class="stat-number text-workout-long">{{ totalHours }}h</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-workout-intervals/20 flex items-center justify-center">
            <Mountain class="w-6 h-6 text-workout-intervals" />
          </div>
          <div>
            <p class="text-sm text-text-muted">Total D+</p>
            <p class="stat-number text-workout-intervals">{{ totalElevation.toLocaleString() }}m</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-xl bg-accent-primary/20 flex items-center justify-center">
            <TrendingUp class="w-6 h-6 text-accent-primary" />
          </div>
          <div>
            <p class="text-sm text-text-muted">Current Phase</p>
            <p class="text-lg font-semibold text-accent-primary truncate">
              {{ currentPhase?.name || 'Base Build' }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- This Week -->
      <div class="lg:col-span-2 card">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary flex items-center gap-2">
            <Calendar class="w-5 h-5 text-text-muted" />
            This Week
          </h2>
          <router-link to="/calendar" class="btn-ghost text-sm flex items-center gap-1">
            View Calendar
            <ChevronRight class="w-4 h-4" />
          </router-link>
        </div>

        <div class="space-y-3">
          <div
            v-for="day in fullWeekDays"
            :key="day.date.toISOString()"
            @click="day.workout ? selectWorkout(day.workout) : null"
            class="flex items-center gap-4 p-3 rounded-lg transition-colors"
            :class="[
              day.workout ? 'bg-bg-tertiary hover:bg-bg-hover cursor-pointer' : 'bg-bg-tertiary/50',
              { 'ring-2 ring-accent-primary': day.isToday && day.workout }
            ]"
          >
            <!-- Completion status / Rest indicator -->
            <div class="flex-shrink-0">
              <CheckCircle2
                v-if="day.workout && isWorkoutCompleted(day.workout)"
                class="w-6 h-6 text-status-completed"
              />
              <Circle
                v-else-if="day.workout"
                class="w-6 h-6 text-text-muted"
              />
              <div
                v-else
                class="w-6 h-6 flex items-center justify-center text-text-muted/50"
              >
                -
              </div>
            </div>

            <!-- Workout type indicator -->
            <div
              :class="[
                'w-3 h-12 rounded-full flex-shrink-0',
                day.workout
                  ? workoutColors[getWorkoutType(day.workout['Session Type'] || day.workout.SessionType)]
                  : 'bg-workout-rest'
              ]"
            ></div>

            <!-- Workout info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span
                  class="font-medium"
                  :class="day.workout ? 'text-text-primary' : 'text-text-muted'"
                >
                  {{ day.workout ? (day.workout['Session Type'] || day.workout.SessionType) : 'Rest Day' }}
                </span>
                <span
                  v-if="day.isToday"
                  class="badge bg-accent-primary/20 text-accent-primary text-xs"
                >
                  Today
                </span>
              </div>
              <p class="text-sm text-text-muted truncate">
                <template v-if="day.workout">
                  {{ day.workout['Planned Duration'] || day.workout.PlannedDuration }} • {{ day.workout.Focus }}
                </template>
                <template v-else>
                  Recovery & adaptation
                </template>
              </p>
            </div>

            <!-- Day -->
            <div class="text-right flex-shrink-0">
              <p class="text-sm font-medium" :class="day.isToday ? 'text-accent-primary' : 'text-text-primary'">
                {{ formatDayName(day.date) }}
              </p>
              <p class="text-xs text-text-muted">{{ formatWorkoutDate(day.date) }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Races Sidebar -->
      <div class="space-y-6">
        <!-- Next Workout -->
        <div v-if="nextWorkout" class="card">
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
            Next Workout
          </h3>
          <div
            @click="selectWorkout(nextWorkout)"
            class="p-4 rounded-lg bg-gradient-to-br from-accent-primary/20 to-accent-secondary/10 border border-accent-primary/30 cursor-pointer hover:border-accent-primary/50 transition-colors"
          >
            <p class="font-semibold text-text-primary">
              {{ nextWorkout['Session Type'] || nextWorkout.SessionType }}
            </p>
            <p class="text-sm text-text-muted mt-1">
              {{ nextWorkout['Planned Duration'] || nextWorkout.PlannedDuration }}
            </p>
            <p class="text-xs text-accent-primary mt-2">
              {{ formatWorkoutDate(nextWorkout.date) }}
            </p>
          </div>
        </div>

        <!-- Upcoming Races -->
        <div class="card">
          <h3 class="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2">
            <Trophy class="w-4 h-4" />
            Races
          </h3>
          <div class="space-y-3">
            <div
              v-for="race in races"
              :key="race.name"
              class="p-3 rounded-lg"
              :class="[
                race.type === 'goal'
                  ? 'bg-workout-race/10 border border-workout-race/30'
                  : 'bg-bg-tertiary'
              ]"
            >
              <div class="flex items-center justify-between">
                <div>
                  <p class="font-medium text-text-primary">{{ race.name }}</p>
                  <p class="text-xs text-text-muted">{{ race.distance }}</p>
                </div>
                <div class="text-right">
                  <p
                    class="font-mono font-semibold"
                    :class="race.type === 'goal' ? 'text-workout-race' : 'text-text-primary'"
                  >
                    {{ getDaysUntilRace(race.date) }}
                  </p>
                  <p class="text-xs text-text-muted">days</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Workout Modal -->
    <WorkoutModal
      :workout="selectedWorkout"
      :show="showModal"
      @close="closeModal"
    />
  </div>
</template>
