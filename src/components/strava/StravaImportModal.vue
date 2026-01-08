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

// Tab and pagination state
const activeTab = ref('matched')
const allActivities = ref([])
const currentPage = ref(1)
const hasMoreActivities = ref(true)
const loadingMore = ref(false)
const ACTIVITIES_PER_PAGE = 20

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

// Reset state when modal opens
watch(() => props.show, (newShow) => {
  if (newShow) {
    activeTab.value = 'matched'
    selectedActivity.value = matchingActivities.value[0] || null
  }
})

async function refreshActivities() {
  await fetchActivities({ perPage: 50 })
  if (props.workout) {
    const workoutType = props.workout.type || 'easy'
    matchingActivities.value = findMatchingActivities(props.workout.date, workoutType)
  }
  // Also refresh all activities if on that tab
  if (activeTab.value === 'all') {
    await loadAllActivities()
  }
}

// Tab switching
function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'all' && allActivities.value.length === 0) {
    loadAllActivities()
  }
}

// Load all activities (first page)
async function loadAllActivities() {
  currentPage.value = 1
  allActivities.value = []
  hasMoreActivities.value = true
  await loadMoreActivities()
}

// Load more activities (pagination)
async function loadMoreActivities() {
  if (loadingMore.value || !hasMoreActivities.value) return

  loadingMore.value = true
  try {
    const newActivities = await fetchActivities({
      perPage: ACTIVITIES_PER_PAGE,
      page: currentPage.value
    })

    if (newActivities.length < ACTIVITIES_PER_PAGE) {
      hasMoreActivities.value = false
    }

    // Append to existing (avoid duplicates by id)
    const existingIds = new Set(allActivities.value.map(a => a.id))
    const uniqueNew = newActivities.filter(a => !existingIds.has(a.id))
    allActivities.value = [...allActivities.value, ...uniqueNew]

    currentPage.value++
  } catch (error) {
    console.error('Failed to load more activities:', error)
  } finally {
    loadingMore.value = false
  }
}

// Infinite scroll handler
function handleScroll(event) {
  if (activeTab.value !== 'all') return

  const container = event.target
  const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight

  // Load more when within 100px of bottom
  if (scrollBottom < 100 && !loadingMore.value && hasMoreActivities.value) {
    loadMoreActivities()
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
                :disabled="loading || loadingMore"
              >
                <RefreshCw :class="['w-5 h-5', { 'animate-spin': loading }]" />
              </button>
              <button @click="emit('close')" class="btn-ghost p-2">
                <X class="w-5 h-5" />
              </button>
            </div>
          </div>

          <!-- Tabs -->
          <div class="flex border-b border-border bg-bg-secondary">
            <button
              @click="switchTab('matched')"
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'matched'
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-text-secondary'"
            >
              For This Date
              <span v-if="matchingActivities.length" class="ml-1.5 px-1.5 py-0.5 text-xs rounded-full bg-accent-primary/20 text-accent-primary">
                {{ matchingActivities.length }}
              </span>
            </button>
            <button
              @click="switchTab('all')"
              class="flex-1 px-4 py-3 text-sm font-medium transition-colors"
              :class="activeTab === 'all'
                ? 'text-accent-primary border-b-2 border-accent-primary'
                : 'text-text-muted hover:text-text-secondary'"
            >
              All Activities
            </button>
          </div>

          <!-- Content -->
          <div
            class="p-4 overflow-y-auto max-h-[60vh]"
            @scroll="handleScroll"
          >
            <!-- FOR THIS DATE TAB -->
            <template v-if="activeTab === 'matched'">
              <!-- Loading -->
              <div v-if="loading && matchingActivities.length === 0" class="py-12 text-center">
                <Loader2 class="w-8 h-8 text-accent-primary animate-spin mx-auto mb-2" />
                <p class="text-text-muted">Loading activities...</p>
              </div>

              <!-- No matching activities -->
              <div v-else-if="matchingActivities.length === 0" class="py-12 text-center">
                <p class="text-text-muted mb-2">No activities found for this date</p>
                <p class="text-sm text-text-muted mb-4">Try browsing all your activities</p>
                <button @click="switchTab('all')" class="btn-secondary">
                  Browse All Activities
                </button>
              </div>

              <!-- Matched activity list -->
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
            </template>

            <!-- ALL ACTIVITIES TAB -->
            <template v-else-if="activeTab === 'all'">
              <!-- Initial loading -->
              <div v-if="loadingMore && allActivities.length === 0" class="py-12 text-center">
                <Loader2 class="w-8 h-8 text-accent-primary animate-spin mx-auto mb-2" />
                <p class="text-text-muted">Loading activities...</p>
              </div>

              <!-- Empty state -->
              <div v-else-if="!loadingMore && allActivities.length === 0" class="py-12 text-center">
                <p class="text-text-muted mb-4">No activities found</p>
                <button @click="loadAllActivities" class="btn-secondary">
                  <RefreshCw class="w-4 h-4 mr-2" />
                  Load Activities
                </button>
              </div>

              <!-- All activities list -->
              <div v-else class="space-y-3">
                <div
                  v-for="activity in allActivities"
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

                <!-- Loading more indicator -->
                <div v-if="loadingMore" class="py-4 text-center">
                  <Loader2 class="w-6 h-6 text-accent-primary animate-spin mx-auto" />
                  <p class="text-sm text-text-muted mt-2">Loading more...</p>
                </div>

                <!-- End of list / Load more button -->
                <div v-else-if="hasMoreActivities" class="py-4 text-center">
                  <button @click="loadMoreActivities" class="text-sm text-text-muted hover:text-accent-primary">
                    Load more activities
                  </button>
                </div>
                <div v-else class="py-4 text-center">
                  <p class="text-sm text-text-muted">No more activities</p>
                </div>
              </div>
            </template>
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
