<script setup>
import { computed } from 'vue'
import { format } from 'date-fns'
import { useWorkoutsStore } from '@/stores/workouts'
import { Check, X } from 'lucide-vue-next'

const props = defineProps({
  day: {
    type: Object,
    required: true
  }
})

const workoutsStore = useWorkoutsStore()

const dayNumber = computed(() => format(props.day.date, 'd'))

const workoutType = computed(() => {
  if (!props.day.workout) return null
  const sessionType = props.day.workout['Session Type'] || props.day.workout.SessionType
  return workoutsStore.getWorkoutType(sessionType)
})

const workoutColor = computed(() => {
  const colors = {
    easy: 'bg-workout-easy',
    long: 'bg-workout-long',
    tempo: 'bg-workout-tempo',
    intervals: 'bg-workout-intervals',
    strength: 'bg-workout-strength',
    rest: 'bg-workout-rest',
    race: 'bg-workout-race',
    recovery: 'bg-workout-recovery'
  }
  return colors[workoutType.value] || 'bg-workout-easy'
})

const lunchSession = computed(() => {
  return workoutsStore.getLunchSession(props.day.workout)
})

const lunchColor = computed(() => {
  if (!lunchSession.value) return ''
  return lunchSession.value.type === 'strength' ? 'bg-workout-strength' : 'bg-workout-easy'
})

const sessionLabel = computed(() => {
  if (!props.day.workout) return ''
  const sessionType = props.day.workout['Session Type'] || props.day.workout.SessionType || ''
  if (sessionType.length > 12) {
    return sessionType.substring(0, 10) + '...'
  }
  return sessionType
})

const isPast = computed(() => {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return props.day.date < today
})

const isRaceDay = computed(() => workoutType.value === 'race')
</script>

<template>
  <div
    class="min-h-[100px] p-2 rounded-lg border transition-all duration-150 cursor-pointer"
    :class="[
      day.isCurrentMonth ? 'bg-bg-tertiary border-border' : 'bg-bg-primary border-transparent opacity-40',
      day.isToday ? 'ring-2 ring-accent-primary border-accent-primary' : '',
      day.workout ? 'hover:border-accent-primary/50 hover:bg-bg-hover' : '',
      isRaceDay ? 'bg-workout-race/10 border-workout-race/30' : ''
    ]"
  >
    <!-- Day number -->
    <div class="flex items-center justify-between mb-2">
      <span
        class="text-sm font-medium"
        :class="[
          day.isToday ? 'text-accent-primary' : day.isCurrentMonth ? 'text-text-primary' : 'text-text-muted'
        ]"
      >
        {{ dayNumber }}
      </span>

      <!-- Completion indicator -->
      <div v-if="day.workout && isPast" class="flex-shrink-0">
        <div
          v-if="day.isCompleted"
          class="w-5 h-5 rounded-full bg-status-completed flex items-center justify-center"
        >
          <Check class="w-3 h-3 text-white" />
        </div>
        <div
          v-else
          class="w-5 h-5 rounded-full bg-status-missed/20 flex items-center justify-center"
        >
          <X class="w-3 h-3 text-status-missed" />
        </div>
      </div>
    </div>

    <!-- Workout info -->
    <div v-if="day.workout" class="space-y-1">
      <!-- AM session -->
      <div class="flex items-center gap-1.5">
        <div :class="['w-2 h-2 rounded-full flex-shrink-0', workoutColor]"></div>
        <span class="text-xs font-medium text-text-primary truncate">
          {{ sessionLabel }}
        </span>
      </div>

      <!-- Duration -->
      <p class="text-xs text-text-muted truncate">
        {{ day.workout['Planned Duration'] || day.workout.PlannedDuration }}
      </p>

      <!-- Lunch session indicator -->
      <div v-if="lunchSession" class="flex items-center gap-1.5 mt-0.5">
        <div :class="['w-2 h-2 rounded-full flex-shrink-0', lunchColor]"></div>
        <span class="text-[10px] text-text-muted truncate">
          {{ lunchSession.title }}
        </span>
      </div>

      <!-- Nutrition badge -->
      <div v-if="day.workout.NutritionDay" class="mt-1">
        <span
          class="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider"
          :class="{
            'bg-green-500/20 text-green-400': day.workout.NutritionDay === 'HIGH',
            'bg-yellow-500/20 text-yellow-400': day.workout.NutritionDay === 'MODERATE',
            'bg-blue-500/20 text-blue-400': day.workout.NutritionDay === 'LOW'
          }"
        >
          {{ day.workout.NutritionDay }}
        </span>
      </div>
    </div>

    <!-- Empty day -->
    <div v-else class="text-xs text-text-muted">
      <!-- No workout -->
    </div>
  </div>
</template>
