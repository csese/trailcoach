<script setup>
import { ref } from 'vue'
import CalendarMonth from '@/components/calendar/CalendarMonth.vue'
import WorkoutModal from '@/components/workout/WorkoutModal.vue'

const selectedWorkout = ref(null)
const showModal = ref(false)

function selectWorkout(workout) {
  selectedWorkout.value = workout
  showModal.value = true
}

function closeModal() {
  showModal.value = false
  selectedWorkout.value = null
}
</script>

<template>
  <div>
    <CalendarMonth @select-workout="selectWorkout" />

    <WorkoutModal
      :workout="selectedWorkout"
      :show="showModal"
      @close="closeModal"
    />
  </div>
</template>
