<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useUserStore } from '@/stores/user'
import { useStrava } from '@/composables/useStrava'
import StravaImportModal from '@/components/strava/StravaImportModal.vue'
import { format } from 'date-fns'
import {
  X,
  Clock,
  Heart,
  Mountain,
  Target,
  TrendingUp,
  Save,
  Trash2,
  ExternalLink,
  Download
} from 'lucide-vue-next'

const props = defineProps({
  workout: {
    type: Object,
    default: null
  },
  show: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { isConnected: stravaConnected, isConfigured: stravaConfigured, checkConnection } = useStrava()
const showStravaImport = ref(false)

// Check Strava connection on mount
onMounted(() => {
  if (stravaConfigured.value) {
    checkConnection()
  }
})

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()
const userStore = useUserStore()

// Form state
const actualDuration = ref('')
const actualHrAvg = ref('')
const actualDistance = ref('')
const actualElevation = ref('')
const rpe = ref(5)
const notes = ref('')
const externalLink = ref('')

// Computed
const workoutType = computed(() => {
  if (!props.workout) return 'easy'
  const sessionType = props.workout['Session Type'] || props.workout.SessionType
  return workoutsStore.getWorkoutType(sessionType)
})

const badgeClass = computed(() => {
  const classes = {
    easy: 'badge-easy',
    long: 'badge-long',
    tempo: 'badge-tempo',
    intervals: 'badge-intervals',
    strength: 'badge-strength',
    rest: 'badge-rest',
    race: 'badge-race',
    recovery: 'badge-recovery'
  }
  return classes[workoutType.value] || 'badge-easy'
})

const existingLog = computed(() => {
  if (!props.workout) return null
  return logsStore.getLogByWorkoutId(props.workout.id)
})

const isCompleted = computed(() => !!existingLog.value)

const formattedDate = computed(() => {
  if (!props.workout?.date) return ''
  return format(props.workout.date, 'EEEE, MMMM d, yyyy')
})

// Watch for workout changes to load existing log
watch(() => props.workout, (newWorkout) => {
  if (newWorkout && existingLog.value) {
    actualDuration.value = existingLog.value.actualDuration || ''
    actualHrAvg.value = existingLog.value.actualHrAvg || ''
    actualDistance.value = existingLog.value.actualDistance || ''
    actualElevation.value = existingLog.value.actualElevation || ''
    rpe.value = existingLog.value.rpe || 5
    notes.value = existingLog.value.notes || ''
    externalLink.value = existingLog.value.externalLink || ''
  } else {
    resetForm()
  }
}, { immediate: true })

function resetForm() {
  actualDuration.value = ''
  actualHrAvg.value = ''
  actualDistance.value = ''
  actualElevation.value = ''
  rpe.value = 5
  notes.value = ''
  externalLink.value = ''
}

function saveLog() {
  if (!props.workout) return

  logsStore.saveLog(props.workout.id, {
    actualDuration: actualDuration.value ? parseInt(actualDuration.value) : null,
    actualHrAvg: actualHrAvg.value ? parseInt(actualHrAvg.value) : null,
    actualDistance: actualDistance.value ? parseFloat(actualDistance.value) : null,
    actualElevation: actualElevation.value ? parseInt(actualElevation.value) : null,
    rpe: rpe.value,
    notes: notes.value,
    externalLink: externalLink.value
  })

  emit('close')
}

function deleteLog() {
  if (!props.workout) return
  logsStore.deleteLog(props.workout.id)
  resetForm()
}

function close() {
  emit('close')
}

function handleStravaImport(logData) {
  // Update form with imported data
  actualDuration.value = logData.actualDuration || ''
  actualHrAvg.value = logData.actualHrAvg || ''
  actualDistance.value = logData.actualDistance || ''
  actualElevation.value = logData.actualElevation || ''
  externalLink.value = logData.externalLink || ''
  notes.value = logData.notes || ''
  showStravaImport.value = false
}

// Get workout field helper
function getField(field) {
  if (!props.workout) return ''
  return props.workout[field] || props.workout[field.replace(/\s/g, '')] || ''
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show && workout"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div
          class="absolute inset-0 bg-black/70 backdrop-blur-sm"
          @click="close"
        ></div>

        <!-- Modal -->
        <div class="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-bg-secondary rounded-2xl border border-border shadow-modal animate-slide-up">
          <!-- Header -->
          <div class="sticky top-0 bg-bg-secondary border-b border-border p-6 flex items-start justify-between">
            <div>
              <div class="flex items-center gap-3 mb-2">
                <span :class="badgeClass">
                  {{ getField('Session Type') }}
                </span>
                <span v-if="isCompleted" class="badge bg-status-completed/20 text-status-completed">
                  Completed
                </span>
              </div>
              <p class="text-sm text-text-muted">{{ formattedDate }}</p>
              <p class="text-xs text-text-muted mt-1">{{ getField('Phase') }} • Week {{ getField('Week') }}</p>
            </div>
            <button @click="close" class="btn-ghost p-2 -mr-2 -mt-2">
              <X class="w-5 h-5" />
            </button>
          </div>

          <!-- Content -->
          <div class="p-6 space-y-6">
            <!-- Targets -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div class="card bg-bg-tertiary">
                <Clock class="w-5 h-5 text-text-muted mb-2" />
                <p class="text-xs text-text-muted">Duration</p>
                <p class="font-semibold text-text-primary">{{ getField('Planned Duration') }}</p>
              </div>
              <div class="card bg-bg-tertiary">
                <Heart class="w-5 h-5 text-text-muted mb-2" />
                <p class="text-xs text-text-muted">HR Zone</p>
                <p class="font-semibold text-text-primary">{{ getField('Target HR/Zone') || 'N/A' }}</p>
              </div>
              <div class="card bg-bg-tertiary">
                <Target class="w-5 h-5 text-text-muted mb-2" />
                <p class="text-xs text-text-muted">Focus</p>
                <p class="font-semibold text-text-primary text-sm">{{ getField('Focus') || 'General' }}</p>
              </div>
              <div class="card bg-bg-tertiary">
                <TrendingUp class="w-5 h-5 text-text-muted mb-2" />
                <p class="text-xs text-text-muted">Details</p>
                <p class="font-semibold text-text-primary text-sm truncate">{{ getField('Details') || '-' }}</p>
              </div>
            </div>

            <!-- Full Description -->
            <div>
              <h3 class="text-sm font-semibold text-text-primary mb-2">Workout Description</h3>
              <div class="card bg-bg-tertiary">
                <p class="text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                  {{ getField('Workout Description') || getField('WorkoutDescription') || 'No detailed description available.' }}
                </p>
              </div>
            </div>

            <!-- Log Form -->
            <div class="border-t border-border pt-6">
              <div class="flex items-center justify-between mb-4">
                <h3 class="text-sm font-semibold text-text-primary">
                  {{ isCompleted ? 'Update Log' : 'Log Workout' }}
                </h3>
                <button
                  v-if="stravaConfigured && stravaConnected"
                  @click="showStravaImport = true"
                  class="btn-secondary text-sm flex items-center gap-2"
                  style="color: #FC4C02; border-color: #FC4C02;"
                >
                  <Download class="w-4 h-4" />
                  Import from Strava
                </button>
              </div>

              <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                <div>
                  <label class="block text-xs text-text-muted mb-1">Duration (min)</label>
                  <input
                    v-model="actualDuration"
                    type="number"
                    class="input"
                    placeholder="60"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-muted mb-1">Avg HR (bpm)</label>
                  <input
                    v-model="actualHrAvg"
                    type="number"
                    class="input"
                    placeholder="145"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-muted mb-1">Distance (km)</label>
                  <input
                    v-model="actualDistance"
                    type="number"
                    step="0.1"
                    class="input"
                    placeholder="12.5"
                  />
                </div>
                <div>
                  <label class="block text-xs text-text-muted mb-1">Elevation (m)</label>
                  <input
                    v-model="actualElevation"
                    type="number"
                    class="input"
                    placeholder="500"
                  />
                </div>
              </div>

              <!-- RPE Slider -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-2">
                  RPE (Rate of Perceived Exertion): <span class="text-accent-primary font-semibold">{{ rpe }}/10</span>
                </label>
                <input
                  v-model="rpe"
                  type="range"
                  min="1"
                  max="10"
                  class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary"
                />
                <div class="flex justify-between text-xs text-text-muted mt-1">
                  <span>Easy</span>
                  <span>Moderate</span>
                  <span>Hard</span>
                  <span>Max</span>
                </div>
              </div>

              <!-- Notes -->
              <div class="mb-4">
                <label class="block text-xs text-text-muted mb-1">Notes</label>
                <textarea
                  v-model="notes"
                  class="input min-h-[80px]"
                  placeholder="How did it feel? Any issues?"
                ></textarea>
              </div>

              <!-- External Link -->
              <div class="mb-6">
                <label class="block text-xs text-text-muted mb-1">Strava/Garmin Link (optional)</label>
                <div class="relative">
                  <ExternalLink class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                  <input
                    v-model="externalLink"
                    type="url"
                    class="input pl-10"
                    placeholder="https://strava.com/activities/..."
                  />
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center justify-between">
                <button
                  v-if="isCompleted"
                  @click="deleteLog"
                  class="btn-ghost text-status-missed flex items-center gap-2"
                >
                  <Trash2 class="w-4 h-4" />
                  Delete Log
                </button>
                <div v-else></div>

                <button @click="saveLog" class="btn-primary flex items-center gap-2">
                  <Save class="w-4 h-4" />
                  {{ isCompleted ? 'Update' : 'Save' }} Log
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Strava Import Modal -->
    <StravaImportModal
      :show="showStravaImport"
      :workout="workout"
      @close="showStravaImport = false"
      @imported="handleStravaImport"
    />
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

.modal-enter-active .animate-slide-up,
.modal-leave-active .animate-slide-up {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.modal-enter-from .animate-slide-up,
.modal-leave-to .animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
}
</style>
