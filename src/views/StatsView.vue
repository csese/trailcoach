<script setup>
import { computed, onMounted } from 'vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { BarChart3, Clock, Mountain, TrendingUp, Target, Activity } from 'lucide-vue-next'

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()

onMounted(() => {
  logsStore.loadLogs()
})

// Stats calculations
const totalWorkoutsPlanned = computed(() => workoutsStore.workouts.length)

const pastWorkouts = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return workoutsStore.workouts.filter(w => w.date && w.date < today)
})

const completedCount = computed(() => logsStore.completedCount)

const completionRate = computed(() => {
  if (pastWorkouts.value.length === 0) return 0
  return Math.round((completedCount.value / pastWorkouts.value.length) * 100)
})

const totalDuration = computed(() => logsStore.totalActualDuration)
const totalDistance = computed(() => logsStore.totalActualDistance)
const totalElevation = computed(() => logsStore.totalActualElevation)
const averageRpe = computed(() => logsStore.averageRpe)

// Hours breakdown
const totalHours = computed(() => Math.round(totalDuration.value / 60))
const totalMinutes = computed(() => totalDuration.value % 60)

// Workout type distribution
const workoutTypeStats = computed(() => {
  const types = {}
  logsStore.logs.forEach(log => {
    const workout = workoutsStore.workouts.find(w => w.id === log.workoutId)
    if (workout) {
      const type = workoutsStore.getWorkoutType(workout['Session Type'] || workout.SessionType)
      types[type] = (types[type] || 0) + 1
    }
  })
  return types
})

const typeColors = {
  easy: { bg: 'bg-workout-easy', label: 'Easy/Recovery' },
  long: { bg: 'bg-workout-long', label: 'Long Run' },
  tempo: { bg: 'bg-workout-tempo', label: 'Tempo' },
  intervals: { bg: 'bg-workout-intervals', label: 'Intervals' },
  strength: { bg: 'bg-workout-strength', label: 'Strength' },
  rest: { bg: 'bg-workout-rest', label: 'Rest' },
  recovery: { bg: 'bg-workout-recovery', label: 'Recovery' }
}

// Weekly stats (last 4 weeks)
const weeklyStats = computed(() => {
  const weeks = []
  const today = new Date()

  for (let i = 3; i >= 0; i--) {
    const weekStart = new Date(today)
    weekStart.setDate(weekStart.getDate() - (7 * i) - weekStart.getDay() + 1)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)

    const weekLogs = logsStore.logs.filter(log => {
      const logDate = new Date(log.completedAt)
      return logDate >= weekStart && logDate <= weekEnd
    })

    const duration = weekLogs.reduce((sum, l) => sum + (l.actualDuration || 0), 0)
    const distance = weekLogs.reduce((sum, l) => sum + (l.actualDistance || 0), 0)

    weeks.push({
      label: `Week ${4 - i}`,
      duration: Math.round(duration / 60),
      distance: Math.round(distance),
      workouts: weekLogs.length
    })
  }

  return weeks
})

const maxWeeklyDuration = computed(() => {
  return Math.max(...weeklyStats.value.map(w => w.duration), 1)
})
</script>

<template>
  <div class="space-y-6">
    <!-- Overview Stats -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-status-completed/20 flex items-center justify-center">
            <Target class="w-5 h-5 text-status-completed" />
          </div>
          <span class="text-sm text-text-muted">Completion Rate</span>
        </div>
        <p class="stat-number text-status-completed">{{ completionRate }}%</p>
        <p class="text-xs text-text-muted mt-1">{{ completedCount }}/{{ pastWorkouts.length }} workouts</p>
      </div>

      <div class="card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-workout-long/20 flex items-center justify-center">
            <Clock class="w-5 h-5 text-workout-long" />
          </div>
          <span class="text-sm text-text-muted">Total Time</span>
        </div>
        <p class="stat-number text-workout-long">{{ totalHours }}h {{ totalMinutes }}m</p>
        <p class="text-xs text-text-muted mt-1">Time logged</p>
      </div>

      <div class="card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-workout-tempo/20 flex items-center justify-center">
            <TrendingUp class="w-5 h-5 text-workout-tempo" />
          </div>
          <span class="text-sm text-text-muted">Distance</span>
        </div>
        <p class="stat-number text-workout-tempo">{{ totalDistance.toFixed(1) }} km</p>
        <p class="text-xs text-text-muted mt-1">Total distance</p>
      </div>

      <div class="card">
        <div class="flex items-center gap-3 mb-3">
          <div class="w-10 h-10 rounded-lg bg-workout-intervals/20 flex items-center justify-center">
            <Mountain class="w-5 h-5 text-workout-intervals" />
          </div>
          <span class="text-sm text-text-muted">Elevation</span>
        </div>
        <p class="stat-number text-workout-intervals">{{ totalElevation.toLocaleString() }}m</p>
        <p class="text-xs text-text-muted mt-1">D+ accumulated</p>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Weekly Volume Chart -->
      <div class="card">
        <h3 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <BarChart3 class="w-5 h-5 text-text-muted" />
          Weekly Volume
        </h3>

        <div class="space-y-4">
          <div v-for="week in weeklyStats" :key="week.label" class="space-y-2">
            <div class="flex justify-between text-sm">
              <span class="text-text-muted">{{ week.label }}</span>
              <span class="text-text-primary font-medium">{{ week.duration }}h</span>
            </div>
            <div class="h-4 bg-bg-tertiary rounded-full overflow-hidden">
              <div
                class="h-full bg-gradient-to-r from-accent-primary to-accent-secondary rounded-full transition-all duration-500"
                :style="{ width: `${(week.duration / maxWeeklyDuration) * 100}%` }"
              ></div>
            </div>
            <div class="flex gap-4 text-xs text-text-muted">
              <span>{{ week.workouts }} workouts</span>
              <span>{{ week.distance }} km</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Workout Type Distribution -->
      <div class="card">
        <h3 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Activity class="w-5 h-5 text-text-muted" />
          Workout Distribution
        </h3>

        <div class="space-y-3">
          <div
            v-for="(count, type) in workoutTypeStats"
            :key="type"
            class="flex items-center gap-3"
          >
            <div :class="['w-4 h-4 rounded-full', typeColors[type]?.bg || 'bg-accent-primary']"></div>
            <span class="flex-1 text-text-primary">{{ typeColors[type]?.label || type }}</span>
            <span class="font-mono text-text-muted">{{ count }}</span>
          </div>

          <div v-if="Object.keys(workoutTypeStats).length === 0" class="text-center py-8 text-text-muted">
            No completed workouts yet
          </div>
        </div>
      </div>
    </div>

    <!-- Average RPE -->
    <div class="card">
      <h3 class="text-lg font-semibold text-text-primary mb-4">Average Perceived Effort</h3>

      <div class="flex items-center gap-4">
        <div class="text-4xl font-mono font-bold text-accent-primary">
          {{ averageRpe.toFixed(1) }}
        </div>
        <div class="flex-1">
          <div class="h-3 bg-bg-tertiary rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="[
                averageRpe <= 3 ? 'bg-workout-easy' :
                averageRpe <= 5 ? 'bg-workout-long' :
                averageRpe <= 7 ? 'bg-workout-tempo' :
                'bg-workout-intervals'
              ]"
              :style="{ width: `${(averageRpe / 10) * 100}%` }"
            ></div>
          </div>
          <div class="flex justify-between text-xs text-text-muted mt-1">
            <span>Easy (1-3)</span>
            <span>Moderate (4-6)</span>
            <span>Hard (7-8)</span>
            <span>Max (9-10)</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
