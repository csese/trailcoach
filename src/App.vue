<script setup>
import { ref, onMounted, provide, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useReadinessStore } from '@/stores/readiness'
import { useAdaptationsStore } from '@/stores/adaptations'
import { useSupabase } from '@/composables/useSupabase'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()
const readinessStore = useReadinessStore()
const adaptationsStore = useAdaptationsStore()
const { onAuthStateChange } = useSupabase()
const route = useRoute()

const sidebarOpen = ref(false)

// Provide sidebar state to children
provide('sidebarOpen', sidebarOpen)
provide('toggleSidebar', () => sidebarOpen.value = !sidebarOpen.value)
provide('closeSidebar', () => sidebarOpen.value = false)

// Close sidebar on route change (mobile)
watch(() => route.path, () => {
  sidebarOpen.value = false
})

// Load workouts with user overrides if logged in
async function initializeWorkouts() {
  await workoutsStore.loadOverrides()
  if (!workoutsStore.workouts.length) {
    workoutsStore.loadWorkouts()
  }
}

onMounted(() => {
  const bootstrap = async () => {
    await initializeWorkouts()
    await Promise.all([
      logsStore.loadLogs(),
      readinessStore.loadEntries(),
      adaptationsStore.loadProposals()
    ])
    await adaptationsStore.ensureWeeklyProposal({ windowDays: 14 })
  }

  bootstrap()

  // Listen for auth state changes to reload overrides
  onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN') {
      await workoutsStore.loadOverrides()
      await Promise.all([
        logsStore.loadLogs(),
        readinessStore.loadEntries(),
        adaptationsStore.loadProposals()
      ])
      await adaptationsStore.ensureWeeklyProposal({ windowDays: 14 })
    } else if (event === 'SIGNED_OUT') {
      // Reset to original plan when logged out
      await workoutsStore.loadOverrides()
      logsStore.loadLogs()
      readinessStore.loadEntries()
      adaptationsStore.loadProposals()
    }
  })
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary flex">
    <!-- Mobile Backdrop -->
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-40 bg-black/50 lg:hidden"
        @click="sidebarOpen = false"
      ></div>
    </Transition>

    <!-- Sidebar -->
    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <!-- Main Content -->
    <div class="flex-1 flex flex-col min-h-screen lg:ml-64">
      <!-- Header -->
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

      <!-- Page Content -->
      <main class="flex-1 p-4 md:p-6 overflow-auto">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
