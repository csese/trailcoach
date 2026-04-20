<script setup>
import { ref, onMounted, provide, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { useSupabase } from '@/composables/useSupabase'
import AppHeader from '@/components/layout/AppHeader.vue'
import AppSidebar from '@/components/layout/AppSidebar.vue'

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()
const { onAuthStateChange } = useSupabase()
const route = useRoute()

const sidebarOpen = ref(false)

provide('sidebarOpen', sidebarOpen)
provide('toggleSidebar', () => sidebarOpen.value = !sidebarOpen.value)
provide('closeSidebar', () => sidebarOpen.value = false)

watch(() => route.path, () => {
  sidebarOpen.value = false
})

async function initializeWorkouts() {
  await workoutsStore.loadOverrides()
  if (!workoutsStore.workouts.length) {
    workoutsStore.loadWorkouts()
  }
}

onMounted(() => {
  const bootstrap = async () => {
    await initializeWorkouts()
    await logsStore.loadLogs()
  }

  bootstrap()

  onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN') {
      await workoutsStore.loadOverrides()
      await logsStore.loadLogs()
    } else if (event === 'SIGNED_OUT') {
      await workoutsStore.loadOverrides()
      logsStore.loadLogs()
    }
  })
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary flex">
    <Transition name="fade">
      <div
        v-if="sidebarOpen"
        class="fixed inset-0 z-40 bg-black/50 lg:hidden"
        @click="sidebarOpen = false"
      ></div>
    </Transition>

    <AppSidebar :open="sidebarOpen" @close="sidebarOpen = false" />

    <div class="flex-1 flex flex-col min-h-screen lg:ml-64">
      <AppHeader @toggle-sidebar="sidebarOpen = !sidebarOpen" />

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
