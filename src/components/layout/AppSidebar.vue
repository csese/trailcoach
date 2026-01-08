<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUserStore } from '@/stores/user'
import {
  LayoutDashboard,
  Calendar,
  TrendingUp,
  BarChart3,
  Settings,
  Mountain,
  Trophy,
  X
} from 'lucide-vue-next'

defineProps({
  open: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const route = useRoute()
const userStore = useUserStore()

const navigation = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Calendar', path: '/calendar', icon: Calendar },
  { name: 'Phases', path: '/phases', icon: TrendingUp },
  { name: 'Stats', path: '/stats', icon: BarChart3 },
  { name: 'Settings', path: '/settings', icon: Settings }
]

const isActive = (path) => route.path === path

const nextRace = computed(() => userStore.daysUntilNextRace)
</script>

<template>
  <aside
    class="fixed left-0 top-0 h-full w-64 bg-bg-secondary border-r border-border flex flex-col z-50 transition-transform duration-300 ease-in-out lg:translate-x-0"
    :class="open ? 'translate-x-0' : '-translate-x-full'"
  >
    <!-- Logo -->
    <div class="p-6 border-b border-border">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-accent-primary flex items-center justify-center">
            <Mountain class="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 class="text-lg font-bold text-text-primary">TrailCoach</h1>
            <p class="text-xs text-text-muted">Nice 110K Training</p>
          </div>
        </div>
        <button
          @click="emit('close')"
          class="lg:hidden p-2 rounded-lg hover:bg-bg-tertiary text-text-muted"
        >
          <X class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4">
      <ul class="space-y-1">
        <li v-for="item in navigation" :key="item.path">
          <router-link
            :to="item.path"
            class="flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-150"
            :class="[
              isActive(item.path)
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:bg-bg-tertiary hover:text-text-primary'
            ]"
          >
            <component :is="item.icon" class="w-5 h-5" />
            <span class="font-medium">{{ item.name }}</span>
          </router-link>
        </li>
      </ul>
    </nav>

    <!-- Race Countdown -->
    <div v-if="nextRace" class="p-4 border-t border-border">
      <div class="card bg-gradient-to-br from-accent-primary/20 to-accent-secondary/10 border-accent-primary/30">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-lg bg-accent-primary/20 flex items-center justify-center">
            <Trophy class="w-5 h-5 text-accent-primary" />
          </div>
          <div>
            <p class="text-xs text-text-muted uppercase tracking-wider">Next Race</p>
            <p class="font-semibold text-text-primary">{{ nextRace.race.name }}</p>
            <p class="text-sm text-accent-primary font-mono">{{ nextRace.days }} days</p>
          </div>
        </div>
      </div>
    </div>
  </aside>
</template>
