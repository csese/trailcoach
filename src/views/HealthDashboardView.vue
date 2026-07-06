<script setup>
import { ref, computed, onMounted } from 'vue'
import { useBiometrics } from '@/composables/useBiometrics'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { 
 Heart, TrendingUp, Bed, Activity, BarChart3, 
  Calendar, Clock, Target, AlertCircle, CheckCircle,
RefreshCw, Database,    Snowflake, Zap, Flame  
} from 'lucide-vue-next'
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns'

const biometricsStore = useBiometrics()
const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()

const loading = ref(false)
const selectedRange = ref(30) // days
const activeTab = ref('overview') // overview, sleep, training, sources

const tabs = [
  { id: 'overview', label: 'Overview', icon: BarChart3 },
  { id: 'sleep', label: 'Sleep', icon: Bed },
  { id: 'training', label: 'Training Load', icon: Activity },
  { id: 'sources', label: 'Data Sources', icon: Database }
]

onMounted(async () => {
  loading.value = true
  await Promise.all([
    biometricsStore.loadBiometrics(selectedRange.value),
    logsStore.loadLogs(),
    workoutsStore.loadWorkouts()
  ])
  loading.value = false
})

// Computed: daily data combining biometrics + workouts
const dailyData = computed(() => {
  const data = []
  const days = selectedRange.value
  
  for (let i = days - 1; i >= 0; i--) {
    const date = subDays(new Date(), i)
    const dateStr = format(date, 'yyyy-MM-dd')
    
    const bio = biometricsStore.getByDate(date)
    const workout = logsStore.logs.find(l => {
      const logDate = format(new Date(l.completedAt || ''), 'yyyy-MM-dd')
      return logDate === dateStr
    })
    
    data.push({
      date: dateStr,
      day: format(date, 'EEE d'),
      // Biometrics
      restingHr: bio?.resting_hr || null,
      hrv: bio?.hrv_rmssd || null,
      sleepScore: bio?.sleep_score || null,
      sleepMinutes: bio?.sleep_total_minutes || null,
      deepSleep: bio?.sleep_deep_minutes || null,
      remSleep: bio?.sleep_rem_minutes || null,
      wellnessScore: bio?.wellness_score || null,
      // Workout
      duration: workout?.actualDuration || null,
      distance: workout?.actualDistance || null,
      elevation: workout?.actualElevation || null,
      hr: workout?.actualHrAvg || null,
      rpe: workout?.rpe || null,
      // Combined
      hasWorkout: !!workout,
      hasBiometrics: !!bio
    })
  }
  
  return data
})

// Today's summary
const todaysSummary = computed(() => dailyData.value[dailyData.value.length - 1])

// Wellness trend (last 14 days)
const wellnessTrend = computed(() => {
  return dailyData.value.slice(-14).map(d => ({
    day: d.day.split(' ')[0],
    wellness: d.wellnessScore || 0,
    rhr: d.restingHr || 0,
    hrv: d.hrv || 0
  }))
})

// Sleep trend
const sleepTrend = computed(() => {
  return dailyData.value.slice(-14).map(d => ({
    day: d.day.split(' ')[0],
    total: d.sleepMinutes || 0,
    deep: d.deepSleep || 0,
    rem: d.remSleep || 0,
    score: d.sleepScore || 0
  }))
})

// Training load trend
const trainingTrend = computed(() => {
  return dailyData.value.slice(-14).map(d => ({
    day: d.day.split(' ')[0],
    duration: d.duration || 0,
    rpe: d.rpe || 0,
    hr: d.hr || 0
  }))
})

// Compute averages for stats
const avgRHR = computed(() => {
  const values = dailyData.value.map(d => d.restingHr).filter(v => v)
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
})

const avgHRV = computed(() => {
  const values = dailyData.value.map(d => d.hrv).filter(v => v)
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
})

const avgSleep = computed(() => {
  const values = dailyData.value.map(d => d.sleepMinutes).filter(v => v)
  return values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : null
})

const totalVolume = computed(() => {
  const recent = dailyData.value.slice(-7)
  const duration = recent.reduce((s, d) => s + (d.duration || 0), 0)
  const distance = recent.reduce((s, d) => s + (d.distance || 0), 0)
  const elevation = recent.reduce((s, d) => s + (d.elevation || 0), 0)
  return { duration: Math.round(duration / 60), distance: Math.round(distance), elevation }
})

// Recovery days detected
const recoveryDays = computed(() => {
  return dailyData.value.filter(d => {
    if (d.restingHr && d.restingHr > 65) return true
    if (d.hrv && d.hrv < 40) return true
    return false
  }).length
})

// Integration status
const integrationStatus = ref([])

async function loadIntegrationStatus() {
  integrationStatus.value = await biometricsStore.getIntegrationStatus()
}

async function runFullSync() {
  // This would trigger the backend sync
  console.log('Running sync...')
}
</script>

<template>
  <div class="space-y-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-bold text-text-primary">Health Dashboard</h1>
        <p class="text-sm text-text-muted mt-1">
          Complete view of biometrics, training load, and recovery status
        </p>
      </div>
      <div class="flex items-center gap-3">
        <select 
          v-model.number="selectedRange"
          @change="biometricsStore.loadBiometrics(selectedRange)"
          class="input text-sm"
        >
          <option value="7">Last 7 days</option>
          <option value="14">Last 14 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button @click="runFullSync" class="btn-ghost p-2">
          <RefreshCw class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Tab Navigation -->
    <div class="flex gap-2">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        @click="activeTab = tab.id"
        :class="[
          'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
          activeTab === tab.id
            ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30'
            : 'text-text-muted hover:text-text-primary hover:bg-bg-tertiary'
        ]"
      >
        <component :is="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Overview Tab -->
    <div v-if="activeTab === 'overview'" class="space-y-6">
      <!-- Key Metrics Cards -->
      <div class="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div class="card">
          <div class="flex items-center gap-3">
            <Heart class="w-5 h-5 text-red-400" />
            <div>
              <p class="text-sm text-text-muted">Avg RHR</p>
              <p class="text-2xl font-bold">{{ avgRHR || '--' }}<span class="text-sm text-text-muted">bpm</span></p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="flex items-center gap-3">
            <TrendingUp class="w-5 h-5 text-purple-400" />
            <div>
              <p class="text-sm text-text-muted">Avg HRV</p>
              <p class="text-2xl font-bold">{{ avgHRV || '--' }}<span class="text-sm text-text-muted">ms</span></p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="flex items-center gap-3">
            <Bed class="w-5 h-5 text-blue-400" />
            <div>
              <p class="text-sm text-text-muted">Avg Sleep</p>
              <p class="text-2xl font-bold">{{ avgSleep ? `${Math.floor(avgSleep / 60)}h ${avgSleep % 60}m` : '--' }}</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="flex items-center gap-3">
            <Activity class="w-5 h-5 text-green-400" />
            <div>
              <p class="text-sm text-text-muted">7d Volume</p>
              <p class="text-2xl font-bold">{{ totalVolume.duration }}<span class="text-sm text-text-muted">h</span></p>
              <p class="text-xs text-text-muted">{{ totalVolume.elevation }}m D+</p>
            </div>
          </div>
        </div>
        
        <div class="card">
          <div class="flex items-center gap-3">
            <Snowflake class="w-5 h-5 text-blue-300" />
            <div>
              <p class="text-sm text-text-muted">Recovery Days</p>
              <p class="text-2xl font-bold">{{ recoveryDays }}<span class="text-sm text-text-muted">/{{ selectedRange }}</span></p>
            </div>
          </div>
        </div>
      </div>

      <!-- Today's Detail -->
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <Calendar class="w-5 h-5 text-text-muted" />
          Today's Summary
        </h2>
        
        <div v-if="todaysSummary" class="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div class="space-y-2">
            <p class="text-xs text-text-muted uppercase">Resting HR</p>
            <p class="text-xl font-bold">{{ todaysSummary.restingHr || '--' }} bpm</p>
            <p v-if="todaysSummary.restingHr" class="text-xs text-text-muted">
                              {{ todaysSummary.restingHr > avgRHR ? '↑ elevated' : '↓ normal' }}
            </p>
          </div>
          
          <div class="space-y-2">
            <p class="text-xs text-text-muted uppercase">HRV (RMSSD)</p>
            <p class="text-xl font-bold">{{ todaysSummary.hrv || '--' }} ms</p>
            <p v-if="todaysSummary.hrv" class="text-xs text-text-muted">
              {{ todaysSummary.hrv > avgHRV ? '↑ good' : '↓ monitor' }}
            </p>
          </div>
          
          <div class="space-y-2">
            <p class="text-xs text-text-muted uppercase">Sleep</p>
            <p class="text-xl font-bold">
              {{ todaysSummary.sleepMinutes 
                ? `${Math.floor(todaysSummary.sleepMinutes / 60)}h ${todaysSummary.sleepMinutes % 60}m`
                : '--' }}
            </p>
            <p v-if="todaysSummary.sleepScore" class="text-xs text-text-muted">
              Score: {{ todaysSummary.sleepScore }}/100
            </p>
          </div>
          
          <div v-if="todaysSummary.hasWorkout" class="space-y-2">
            <p class="text-xs text-text-muted uppercase">Workout</p>
            <p class="text-xl font-bold">{{ todaysSummary.duration }}<span class="text-sm text-text-muted">min</span></p>
            <p class="text-xs text-text-muted">
              RPE: {{ todaysSummary.rpe || '--' }} • HR: {{ todaysSummary.hr || '--' }}
            </p>
          </div>
          
          <div v-else class="space-y-2">
            <p class="text-xs text-text-muted uppercase">Workout</p>
            <p class="text-xl font-bold text-text-muted">Rest day</p>
          </div>
        </div>
      </div>

      <!-- Wellness Trend Chart -->
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <TrendingUp class="w-5 h-5 text-text-muted" />
          Wellness Trend (14 days)
        </h2>
        
        <div class="space-y-4">
          <div v-for="day in wellnessTrend" :key="day.day" class="flex items-center gap-3">
            <span class="text-xs text-text-muted w-10">{{ day.day }}</span>
            
            <div class="flex-1 h-8 bg-bg-tertiary rounded-full overflow-hidden relative">
              <div 
                class="h-full rounded-full transition-all"
                :class="[
                  day.wellness >= 75 ? 'bg-green-400' :
                  day.wellness >= 60 ? 'bg-yellow-400' :
                  day.wellness >= 40 ? 'bg-orange-400' : 'bg-red-400'
                ]"
                :style="{ width: `${day.wellness}%` }"
              ></div>
              <span class="absolute inset-0 flex items-center px-2 text-xs font-medium">
                {{ day.wellness }}
              </span>
            </div>
            
            <div class="flex items-center gap-2 text-xs text-text-muted w-32">
              <span>HRV: {{ day.hrv || '--' }}</span>
              <span>•</span>
              <span>RHR: {{ day.rhr || '--' }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Daily Log Table -->
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4">Daily Log</h2>
        
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-border">
                <th class="text-left py-2 text-text-muted font-medium">Date</th>
                <th class="text-right py-2 text-text-muted font-medium">RHR</th>
                <th class="text-right py-2 text-text-muted font-medium">HRV</th>
                <th class="text-right py-2 text-text-muted font-medium">Sleep</th>
                <th class="text-right py-2 text-text-muted font-medium">Workout</th>
                <th class="text-right py-2 text-text-muted font-medium">RPE</th>
                <th class="text-center py-2 text-text-muted font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="day in dailyData" :key="day.date" class="border-b border-border/50">
                <td class="py-2">{{ day.day }}</td>
                <td class="text-right py-2">{{ day.restingHr || '--' }}</td>
                <td class="text-right py-2">{{ day.hrv || '--' }}</td>
                <td class="text-right py-2">
                  {{ day.sleepMinutes ? `${Math.floor(day.sleepMinutes/60)}h` : '--' }}
                </td>
                <td class="text-right py-2">
                  {{ day.duration ? `${day.duration}min` : '--' }}
                </td>
                <td class="text-right py-2">{{ day.rpe || '--' }}</td>
                <td class="text-center py-2">
                  <span v-if="day.restingHr && day.restingHr > 65" class="badge bg-red-500/20 text-red-400">
                    Monitor
                  </span>
                  <span v-else-if="day.hrv && day.hrv < 40" class="badge bg-orange-500/20 text-orange-400">
                    Caution
                  </span>
                  <span v-else class="badge bg-green-500/20 text-green-400">
                    Good
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- Sleep Tab -->
    <div v-if="activeTab === 'sleep'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Avg Sleep Duration</p>
          <p class="text-3xl font-bold">{{ avgSleep ? `${Math.floor(avgSleep/60)}h ${avgSleep%60}m` : '--' }}</p>
        </div>
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Avg Deep Sleep</p>
          <p class="text-3xl font-bold">
            {{ dailyData.filter(d => d.deepSleep).length 
              ? Math.round(dailyData.reduce((s, d) => s + (d.deepSleep || 0), 0) / dailyData.filter(d => d.deepSleep).length) + 'min'
              : '--' }}
          </p>
        </div>
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Avg REM Sleep</p>
          <p class="text-3xl font-bold">
            {{ dailyData.filter(d => d.remSleep).length 
              ? Math.round(dailyData.reduce((s, d) => s + (d.remSleep || 0), 0) / dailyData.filter(d => d.remSleep).length) + 'min'
              : '--' }}
          </p>
        </div>
      </div>

      <!-- Sleep Stage Breakdown -->
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4">Sleep Stages</h2>
        <div class="space-y-3">
          <div v-for="day in sleepTrend" :key="day.day" class="space-y-1">
            <div class="flex items-center gap-3">
              <span class="text-xs text-text-muted w-10">{{ day.day }}</span>
              <div class="flex-1 flex items-center gap-1">
                <div class="h-6 flex-1 bg-purple-500/30 rounded" :style="{ width: `${Math.min(100, (day.deep / day.total * 100) || 0)}%` }">
                  <span class="text-xs px-1">{{ day.deep }}m</span>
                </div>
                <div class="h-6 flex-1 bg-blue-500/30 rounded" :style="{ width: `${Math.min(100, (day.rem / day.total * 100) || 0)}%` }">
                  <span class="text-xs px-1">{{ day.rem }}m</span>
                </div>
                <div class="h-6 flex-1 bg-green-500/30 rounded">
                  <span class="text-xs px-1">{{ day.total - day.deep - day.rem }}m</span>
                </div>
              </div>
              <span class="text-xs text-text-muted w-16">{{ day.score }}/100</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Training Tab -->
    <div v-if="activeTab === 'training'" class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Total Duration</p>
          <p class="text-3xl font-bold">{{ totalVolume.duration }}h</p>
          <p class="text-xs text-text-muted">last 7 days</p>
        </div>
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Total Distance</p>
          <p class="text-3xl font-bold">{{ totalVolume.distance }}km</p>
          <p class="text-xs text-text-muted">last 7 days</p>
        </div>
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Total D+</p>
          <p class="text-3xl font-bold">{{ totalVolume.elevation }}m</p>
          <p class="text-xs text-text-muted">last 7 days</p>
        </div>
        <div class="card">
          <p class="text-sm text-text-muted mb-2">Avg RPE</p>
          <p class="text-3xl font-bold">
            {{ dailyData.filter(d => d.rpe).length
              ? (dailyData.reduce((s, d) => s + (d.rpe || 0), 0) / dailyData.filter(d => d.rpe).length).toFixed(1)
              : '--' }}
          </p>
          <p class="text-xs text-text-muted">1-10 scale</p>
        </div>
      </div>

      <!-- Training Load by Day -->
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4">Training Load</h2>
        <div class="space-y-3">
          <div v-for="day in trainingTrend" :key="day.day" class="flex items-center gap-3">
            <span class="text-xs text-text-muted w-10">{{ day.day }}</span>
            <div class="flex-1 h-8 bg-bg-tertiary rounded-full overflow-hidden">
              <div 
                class="h-full bg-workout-long rounded-full transition-all"
                :style="{ width: `${Math.min(100, (day.duration / 180) * 100)}%` }"
              ></div>
            </div>
            <span class="text-xs text-text-muted w-20">{{ day.duration }} min</span>
            <span v-if="day.rpe" class="text-xs text-text-muted w-12">RPE {{ day.rpe }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Sources Tab -->
    <div v-if="activeTab === 'sources'" class="space-y-6">
      <div class="card">
        <h2 class="text-lg font-semibold text-text-primary mb-4">Connected Services</h2>
        
        <div class="space-y-3">
          <div 
            v-for="integration in integrationStatus" 
            :key="integration.provider"
            class="flex items-center justify-between p-3 rounded-lg bg-bg-tertiary"
          >
            <div class="flex items-center gap-3">
              <div 
                class="w-10 h-10 rounded-lg flex items-center justify-center"
                :class="[
                  integration.provider === 'eight_sleep' ? 'bg-purple-500/20' :
                  integration.provider === 'google_fit' ? 'bg-blue-500/20' :
                  integration.provider === 'garmin_connect' ? 'bg-red-500/20' :
                  'bg-accent-primary/20'
                ]"
              >
                <Database class="w-5 h-5" />
              </div>
              <div>
                <p class="font-medium text-text-primary">{{ integration.provider }}</p>
                <p class="text-xs text-text-muted">
                  Last sync: {{ integration.last_sync ? format(new Date(integration.last_sync), 'MMM d, HH:mm') : 'Never' }}
                </p>
              </div>
            </div>
            
            <div class="flex items-center gap-3">
              <span 
                class="text-xs px-2 py-1 rounded"
                :class="integration.sync_enabled 
                  ? 'bg-green-500/20 text-green-400' 
                  : 'bg-gray-500/20 text-gray-400'"
              >
                {{ integration.sync_enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>
          </div>
          
          <div v-if="!integrationStatus.length" class="text-center py-8 text-text-muted">
            No integrations configured. Add one in Settings.
          </div>
        </div>
      </div>
      
      <!-- Quick Sync Button -->
      <div class="card">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="text-sm font-semibold text-text-primary">Manual Sync</h3>
            <p class="text-xs text-text-muted mt-1">Pull fresh data from all connected services</p>
          </div>
          <button 
            @click="runFullSync"
            class="btn-primary flex items-center gap-2"
          >
            <RefreshCw class="w-4 h-4" />
            Sync Now
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.card {
  @apply bg-bg-secondary rounded-xl border border-border p-6;
}

.btn-primary {
  @apply bg-accent-primary hover:bg-accent-primary/90 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2;
}

.btn-ghost {
  @apply text-text-muted hover:text-text-primary hover:bg-bg-tertiary rounded-lg transition-colors;
}

.badge {
  @apply inline-flex items-center px-2 py-0.5 rounded text-xs font-medium;
}

.text-text-primary {
  color: var(--text-primary, #fff);
}

.text-text-muted {
  color: var(--text-muted, rgba(255,255,255,0.45));
}

.bg-bg-secondary {
  background: var(--bg-secondary, #1a1a1a);
}

.bg-bg-tertiary {
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
}

.border-border {
  border-color: var(--border, rgba(255,255,255,0.08));
}
</style>
