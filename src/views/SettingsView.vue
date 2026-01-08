<script setup>
import { ref, onMounted } from 'vue'
import { useUserStore } from '@/stores/user'
import { useStrava } from '@/composables/useStrava'
import { User, Heart, Sun, Moon, Download, Save, Link2, Unlink, Loader2, AlertCircle } from 'lucide-vue-next'

const userStore = useUserStore()
const {
  isConfigured: stravaConfigured,
  isConnected: stravaConnected,
  loading: stravaLoading,
  athlete: stravaAthlete,
  authorize: connectStrava,
  disconnect: disconnectStrava,
  checkConnection: checkStravaConnection
} = useStrava()

const displayName = ref('')
const hrZones = ref({})

onMounted(async () => {
  userStore.loadSettings()
  displayName.value = userStore.displayName
  hrZones.value = JSON.parse(JSON.stringify(userStore.hrZones))
  await checkStravaConnection()
})

function saveProfile() {
  userStore.setDisplayName(displayName.value)
}

function saveZones() {
  userStore.setHrZones(hrZones.value)
}

function toggleTheme() {
  const newTheme = userStore.theme === 'dark' ? 'light' : 'dark'
  userStore.setTheme(newTheme)
}

function exportData() {
  const data = {
    settings: {
      displayName: userStore.displayName,
      hrZones: userStore.hrZones
    },
    logs: JSON.parse(localStorage.getItem('trailcoach-logs') || '[]')
  }

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'trailcoach-export.json'
  a.click()
  URL.revokeObjectURL(url)
}

async function handleDisconnectStrava() {
  if (confirm('Are you sure you want to disconnect from Strava?')) {
    await disconnectStrava()
  }
}
</script>

<template>
  <div class="max-w-2xl space-y-6">
    <!-- Profile -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <User class="w-5 h-5 text-text-muted" />
        Profile
      </h2>

      <div class="space-y-4">
        <div>
          <label class="block text-sm text-text-muted mb-2">Display Name</label>
          <input
            v-model="displayName"
            type="text"
            class="input max-w-md"
            placeholder="Your name"
          />
        </div>

        <button @click="saveProfile" class="btn-primary flex items-center gap-2">
          <Save class="w-4 h-4" />
          Save Profile
        </button>
      </div>
    </div>

    <!-- Strava Integration -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <svg class="w-5 h-5 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor">
          <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
        </svg>
        Strava Integration
      </h2>

      <!-- Not configured warning -->
      <div v-if="!stravaConfigured" class="p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30 mb-4">
        <div class="flex items-start gap-3">
          <AlertCircle class="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-yellow-500 font-medium">Strava not configured</p>
            <p class="text-xs text-text-muted mt-1">
              Add VITE_STRAVA_CLIENT_ID and VITE_STRAVA_CLIENT_SECRET to your .env file to enable Strava integration.
            </p>
          </div>
        </div>
      </div>

      <!-- Connected state -->
      <div v-else-if="stravaConnected" class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-[#FC4C02]/20 flex items-center justify-center">
            <svg class="w-5 h-5 text-[#FC4C02]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
            </svg>
          </div>
          <div>
            <p class="text-text-primary font-medium">Connected to Strava</p>
            <p class="text-sm text-text-muted">
              Athlete ID: {{ stravaAthlete?.id || 'Unknown' }}
            </p>
          </div>
        </div>
        <button
          @click="handleDisconnectStrava"
          class="btn-secondary flex items-center gap-2 text-status-missed"
          :disabled="stravaLoading"
        >
          <Loader2 v-if="stravaLoading" class="w-4 h-4 animate-spin" />
          <Unlink v-else class="w-4 h-4" />
          Disconnect
        </button>
      </div>

      <!-- Not connected state -->
      <div v-else class="flex items-center justify-between">
        <div>
          <p class="text-text-primary">Connect your Strava account</p>
          <p class="text-sm text-text-muted">Import activities directly from Strava</p>
        </div>
        <button
          @click="connectStrava"
          class="btn-primary flex items-center gap-2"
          style="background-color: #FC4C02;"
          :disabled="stravaLoading"
        >
          <Loader2 v-if="stravaLoading" class="w-4 h-4 animate-spin" />
          <Link2 v-else class="w-4 h-4" />
          Connect Strava
        </button>
      </div>
    </div>

    <!-- HR Zones -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
        <Heart class="w-5 h-5 text-text-muted" />
        Heart Rate Zones
      </h2>

      <div class="space-y-4">
        <div
          v-for="(zone, key) in hrZones"
          :key="key"
          class="grid grid-cols-4 gap-4 items-center"
        >
          <div class="flex items-center gap-2">
            <div
              class="w-3 h-3 rounded-full"
              :style="{ backgroundColor: zone.color }"
            ></div>
            <span class="text-sm font-medium text-text-primary uppercase">{{ key }}</span>
          </div>
          <div>
            <label class="block text-xs text-text-muted mb-1">Min BPM</label>
            <input
              v-model.number="zone.min"
              type="number"
              class="input"
            />
          </div>
          <div>
            <label class="block text-xs text-text-muted mb-1">Max BPM</label>
            <input
              v-model.number="zone.max"
              type="number"
              class="input"
            />
          </div>
          <div>
            <label class="block text-xs text-text-muted mb-1">Label</label>
            <input
              v-model="zone.label"
              type="text"
              class="input"
            />
          </div>
        </div>

        <button @click="saveZones" class="btn-primary flex items-center gap-2">
          <Save class="w-4 h-4" />
          Save Zones
        </button>
      </div>
    </div>

    <!-- Appearance -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Appearance</h2>

      <div class="flex items-center justify-between">
        <div>
          <p class="text-text-primary">Theme</p>
          <p class="text-sm text-text-muted">Current: {{ userStore.theme }}</p>
        </div>
        <button
          @click="toggleTheme"
          class="btn-secondary flex items-center gap-2"
        >
          <Sun v-if="userStore.theme === 'dark'" class="w-4 h-4" />
          <Moon v-else class="w-4 h-4" />
          Switch to {{ userStore.theme === 'dark' ? 'Light' : 'Dark' }}
        </button>
      </div>
    </div>

    <!-- Export -->
    <div class="card">
      <h2 class="text-lg font-semibold text-text-primary mb-4">Data</h2>

      <div class="flex items-center justify-between">
        <div>
          <p class="text-text-primary">Export Data</p>
          <p class="text-sm text-text-muted">Download your settings and workout logs</p>
        </div>
        <button @click="exportData" class="btn-secondary flex items-center gap-2">
          <Download class="w-4 h-4" />
          Export JSON
        </button>
      </div>
    </div>
  </div>
</template>
