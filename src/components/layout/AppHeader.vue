<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkoutsStore } from '@/stores/workouts'
import { useUserStore } from '@/stores/user'
import { format } from 'date-fns'
import { Bell, User, Menu } from 'lucide-vue-next'

const emit = defineEmits(['toggle-sidebar'])

const route = useRoute()
const workoutsStore = useWorkoutsStore()
const userStore = useUserStore()

const pageTitle = computed(() => route.meta.title || 'Dashboard')

const todaysWorkout = computed(() => workoutsStore.todaysWorkout)
const currentPhase = computed(() => workoutsStore.currentPhase)

const today = format(new Date(), 'EEEE, MMMM d, yyyy')
</script>

<template>
  <header class="sticky top-0 z-40 bg-bg-primary/80 backdrop-blur-sm border-b border-border">
    <div class="px-4 md:px-6 py-4 flex items-center justify-between">
      <!-- Left: Menu button & Page title -->
      <div class="flex items-center gap-3">
        <button
          @click="emit('toggle-sidebar')"
          class="lg:hidden p-2 -ml-2 rounded-lg hover:bg-bg-secondary text-text-secondary"
        >
          <Menu class="w-6 h-6" />
        </button>
        <div>
          <h1 class="text-xl md:text-2xl font-bold text-text-primary">{{ pageTitle }}</h1>
          <div class="flex items-center gap-2 mt-1">
            <span class="text-xs md:text-sm text-text-muted hidden sm:inline">{{ today }}</span>
            <span v-if="currentPhase" class="text-text-muted hidden sm:inline">•</span>
            <span v-if="currentPhase" class="badge-tempo text-xs">
              {{ currentPhase.name }}
            </span>
          </div>
        </div>
      </div>

      <!-- Right: Actions & Profile -->
      <div class="flex items-center gap-4">
        <!-- Today's workout quick view -->
        <div v-if="todaysWorkout" class="hidden md:flex items-center gap-3 px-4 py-2 rounded-lg bg-bg-secondary border border-border">
          <div class="w-2 h-2 rounded-full bg-workout-easy animate-pulse"></div>
          <div>
            <p class="text-xs text-text-muted">Today</p>
            <p class="text-sm font-medium text-text-primary">{{ todaysWorkout['Session Type'] || todaysWorkout.SessionType }}</p>
          </div>
        </div>

        <!-- Notifications -->
        <button class="btn-ghost p-2 rounded-lg relative">
          <Bell class="w-5 h-5" />
          <span class="absolute top-1 right-1 w-2 h-2 rounded-full bg-accent-primary"></span>
        </button>

        <!-- Profile -->
        <button class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-bg-secondary transition-colors">
          <div class="w-8 h-8 rounded-full bg-accent-primary/20 flex items-center justify-center">
            <User class="w-4 h-4 text-accent-primary" />
          </div>
          <span class="text-sm font-medium text-text-primary hidden sm:block">
            {{ userStore.displayName }}
          </span>
        </button>
      </div>
    </div>
  </header>
</template>
