<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useStrava } from '@/composables/useStrava'
import { format } from 'date-fns'
import {
  X,
  RefreshCw,
  Check,
  Clock,
  Mountain,
  Heart,
  TrendingUp,
  ExternalLink,
  Loader2
} from 'lucide-vue-next'

const props = defineProps({
  show: Boolean,
  workout: Object
})

const emit = defineEmits(['close', 'imported'])

const {
  activities,
  loading,
  fetchActivities,
  importActivityToWorkout,
  findMatchingActivities
} = useStrava()

const matchingActivities = ref([])
const selectedActivity = ref(null)
const importing = ref(false)

onMounted(async () => {
  if (activities.value.length === 0) {
    await fetchActivities({ perPage: 50 })
  }
})

watch(() => props.workout, () => {
  if (props.workout) {
    // Find activities matching this workout's date
    const workoutType = props.workout.type || 'easy'
    matchingActivities.value = findMatchingActivities(props.workout.date, workoutType)
    selectedActivity.value = matchingActivities.value[0] || null
  }
}, { immediate: true })

async function refreshActivities() {
  await fetchActivities({ perPage: 50 })
  if (props.workout) {
    const workoutType = props.workout.type || 'easy'
    matchingActivities.value = findMatchingActivities(props.workout.date, workoutType)
  }
}

async function importSelected() {
  if (!selectedActivity.value || !props.workout) return

  importing.value = true
  try {
    const logData = await importActivityToWorkout(selectedActivity.value, props.workout.id)
    emit('imported', logData)
    emit('close')
  } catch (error) {
    console.error('Import failed:', error)
  } finally {
    importing.value = false
  }
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

function formatDistance(meters) {
  return (meters / 1000).toFixed(2) + ' km'
}

function formatDate(dateStr) {
  return format(new Date(dateStr), 'MMM d, yyyy h:mm a')
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')"></div>

        <!-- Modal -->
        <div class="relative w-full max-w-lg max-h-[80vh] overflow-hidden bg-bg-secondary rounded-2xl border border-border shadow-modal animate-slide-up">
          <!-- Header -->
          <div class="sticky top-0 bg-bg-secondary border-b border-border p-4 flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold text-text-primary">Import from Strava</h2>
              <p class="text-sm text-text-muted">
                {{ workout ? format(workout.date, 'EEEE, MMMM d') : '' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <button
                @click="refreshActivities"
                class="btn-ghost p-2"
                :disabled="loading"
              >
                <RefreshCw :class="['w-5 h-5', { 'animate-spin': loading }]" />
              </button>
              <button @click="emit('close')" class="btn-ghost p-2">
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-y-auto max-h-[60vh]">
            <!-- Loading -->
            <div v-if="loading" class="py-12 text-center">
              <Loader2 class="w-8 h-8 text-accent-primary animate-spin mx-auto mb-2" />
              <p class="text-text-muted">Loading activities...</p>
            </div>

            <!-- No matching activities -->
            <div v-else-if="matchingActivities.length === 0" class="py-12 text-center">
              <p class="text-text-muted mb-4">No activities found for this date</p>
              <button @click="refreshActivities" class="btn-secondary">
                <RefreshCw class="w-4 h-4 mr-2" />
                Refresh Activities
              </button>
            </div>

            <!-- Activity list -->
            <div v-else class="space-y-3">
              <div
                v-for="activity in matchingActivities"
                :key="activity.id"
                @click="selectedActivity = activity"
                class="p-4 rounded-xl border-2 cursor-pointer transition-all"
                :class="[
                  selectedActivity?.id === activity.id
                    ? 'border-accent-primary bg-accent-primary/10'
                    : 'border-border bg-bg-tertiary hover:border-border-light'
                ]"
              >
                <div class="flex items-start justify-between mb-3">
                  <div>
                    <h3 class="font-medium text-text-primary">{{ activity.name }}</h3>
                    <p class="text-xs text-text-muted">{{ formatDate(activity.start_date_local || activity.start_date) }}</p>
                  </div>
                  <div v-if="selectedActivity?.id === activity.id" class="w-6 h-6 rounded-full bg-accent-primary flex items-center justify-center">
                    <Check class="w-4 h-4 text-white" />
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div class="flex items-center gap-2">
                    <Clock class="w-4 h-4 text-text-muted" />
                    <span class="text-sm text-text-primary">{{ formatDuration(activity.moving_time) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <TrendingUp class="w-4 h-4 text-text-muted" />
                    <span class="text-sm text-text-primary">{{ formatDistance(activity.distance) }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <Mountain class="w-4 h-4 text-text-muted" />
                    <span class="text-sm text-text-primary">{{ Math.round(activity.total_elevation_gain || 0) }}m</span>
                  </div>
                  <div v-if="activity.average_heartrate" class="flex items-center gap-2">
                    <Heart class="w-4 h-4 text-text-muted" />
                    <span class="text-sm text-text-primary">{{ Math.round(activity.average_heartrate) }} bpm</span>
                  </div>
                </div>

                <a
                  :href="`https://www.strava.com/activities/${activity.id}`"
                  target="_blank"
                  @click.stop
                  class="inline-flex items-center gap-1 text-xs text-accent-primary hover:underline mt-3"
                >
                  View on Strava
                  <ExternalLink class="w-3 h-3" />
                </a>
              </div>
            </div>

            <!-- Show all activities option -->
            <div v-if="activities.length > matchingActivities.length" class="mt-4 pt-4 border-t border-border">
              <p class="text-sm text-text-muted mb-3">
                Showing {{ matchingActivities.length }} activities for this date.
                {{ activities.length }} total activities loaded.
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div class="sticky bottom-0 bg-bg-secondary border-t border-border p-4 flex justify-end gap-3">
            <button @click="emit('close')" class="btn-secondary">
              Cancel
            </button>
            <button
              @click="importSelected"
              class="btn-primary"
              :disabled="!selectedActivity || importing"
            >
              <Loader2 v-if="importing" class="w-4 h-4 mr-2 animate-spin" />
              {{ importing ? 'Importing...' : 'Import Activity' }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>
