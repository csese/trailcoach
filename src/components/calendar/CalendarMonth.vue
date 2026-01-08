<script setup>
import { ref, computed } from 'vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  isSameMonth,
  isSameDay,
  isToday,
  addMonths,
  subMonths
} from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import CalendarDay from './CalendarDay.vue'

const emit = defineEmits(['select-workout'])

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()

const currentDate = ref(new Date())

const monthStart = computed(() => startOfMonth(currentDate.value))
const monthEnd = computed(() => endOfMonth(currentDate.value))

const calendarDays = computed(() => {
  const start = startOfWeek(monthStart.value, { weekStartsOn: 1 })
  const end = endOfWeek(monthEnd.value, { weekStartsOn: 1 })

  const days = []
  let day = start

  while (day <= end) {
    const workout = workoutsStore.getWorkoutByDate(day)
    const isCompleted = workout ? logsStore.isCompleted(workout.id) : false

    days.push({
      date: day,
      isCurrentMonth: isSameMonth(day, currentDate.value),
      isToday: isToday(day),
      workout,
      isCompleted
    })
    day = addDays(day, 1)
  }

  return days
})

const monthTitle = computed(() => format(currentDate.value, 'MMMM yyyy'))

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function previousMonth() {
  currentDate.value = subMonths(currentDate.value, 1)
}

function nextMonth() {
  currentDate.value = addMonths(currentDate.value, 1)
}

function goToToday() {
  currentDate.value = new Date()
}

function selectWorkout(day) {
  if (day.workout) {
    emit('select-workout', day.workout)
  }
}
</script>

<template>
  <div class="card">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="text-xl font-bold text-text-primary">{{ monthTitle }}</h2>
      <div class="flex items-center gap-2">
        <button @click="goToToday" class="btn-ghost text-sm px-3 py-1.5">
          Today
        </button>
        <button @click="previousMonth" class="btn-ghost p-2">
          <ChevronLeft class="w-5 h-5" />
        </button>
        <button @click="nextMonth" class="btn-ghost p-2">
          <ChevronRight class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Week day headers -->
    <div class="grid grid-cols-7 gap-1 mb-2">
      <div
        v-for="day in weekDays"
        :key="day"
        class="text-center text-xs font-medium text-text-muted py-2"
      >
        {{ day }}
      </div>
    </div>

    <!-- Calendar grid -->
    <div class="grid grid-cols-7 gap-1">
      <CalendarDay
        v-for="(day, index) in calendarDays"
        :key="index"
        :day="day"
        @click="selectWorkout(day)"
      />
    </div>

    <!-- Legend -->
    <div class="flex flex-wrap items-center gap-4 mt-6 pt-4 border-t border-border">
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-easy"></div>
        <span class="text-xs text-text-muted">Easy/Recovery</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-long"></div>
        <span class="text-xs text-text-muted">Long Run</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-tempo"></div>
        <span class="text-xs text-text-muted">Tempo</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-intervals"></div>
        <span class="text-xs text-text-muted">Intervals</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-strength"></div>
        <span class="text-xs text-text-muted">Strength</span>
      </div>
      <div class="flex items-center gap-2">
        <div class="w-3 h-3 rounded-full bg-workout-race"></div>
        <span class="text-xs text-text-muted">Race</span>
      </div>
    </div>
  </div>
</template>
