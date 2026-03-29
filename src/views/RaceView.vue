<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { Trophy, MapPin, Utensils, AlertTriangle, Clock, Mountain, Droplets, Flag } from 'lucide-vue-next'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import { Line } from 'vue-chartjs'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, annotationPlugin)

const aidStations = [
  { name: 'Départ', km: 0, dplus: 0, targetTime: '05:30', type: 'start' },
  { name: 'PC2 — Col Notre Dame', km: 17.0, dplus: 976, targetTime: '07:52', type: 'water' },
  { name: 'PC5 — Col de l\'Évêque', km: 30.0, dplus: 1679, targetTime: '09:38', type: 'full' },
  { name: 'PC7 — Col de l\'Évêque', km: 39.5, dplus: 1998, targetTime: '10:45', type: 'full' },
  { name: 'PC8 — Col Notre Dame', km: 44.5, dplus: 2534, targetTime: '11:40', type: 'full', key: true },
  { name: 'PC9 — Théoule', km: 55.5, dplus: 3061, targetTime: '13:07', type: 'water' },
  { name: 'Arrivée', km: 66.6, dplus: 3512, targetTime: '14:30', type: 'finish' },
]

const nutritionPlan = [
  { period: 'Avant (4h00)', action: 'Petit déjeuner', detail: 'Riz ou toast + banane + café. Pas de fibres, rien de nouveau.', glucides: null },
  { period: 'H1 (km 0-8)', action: 'C90 seul', detail: 'Commence doucement, 1 bidon C90. Première barre à km 8.', glucides: 40 },
  { period: 'H2 (km 8-16)', action: 'C90 + 1 barre', detail: 'NeverSecond ou Cliff Bar. Bois régulièrement.', glucides: 65 },
  { period: 'H3 (km 17 — PC2)', action: 'C90 + 1 barre', detail: 'PC2 : remplis eau, 2 min max. Ne t\'arrête pas.', glucides: 65 },
  { period: 'H4 (km 22-30)', action: 'C90 + 1 barre', detail: 'PC5 : ravito complet, mange fruits + salé. 5 min.', glucides: 65 },
  { period: 'H5 (km 30-38)', action: 'C90 + ravito PC5', detail: 'Préfère NeverSecond bar (plus digeste). Évite Cliff après km 35.', glucides: 65 },
  { period: 'H6 (km 38-44)', action: 'C90 + 1 barre', detail: 'PC7 + PC8 : ravitos complets. PC8 = ravito le plus important.', glucides: 65 },
  { period: 'H7 (PC8 km 44)', action: 'Ravito stratégique', detail: 'Mange vraiment : fruits, salé, soupe si dispo. Recharge tout. 5 min.', glucides: 70 },
  { period: 'H8 (km 50-58)', action: 'C90 + 1 barre', detail: 'PC9 à km 55.5 : si dans les temps, ne t\'arrête pas.', glucides: 65 },
  { period: 'H9 (km 58-fin)', action: 'C90 seul', detail: 'Estomac fragile en fin de course. C90 uniquement si besoin. Pousse.', glucides: 50 },
]

// Elevation data extracted from GPX (every 10th point, 278 points)
const elevationData = [1,1,0,3,5,15,37,43,61,43,46,62,75,81,95,127,147,154,122,105,87,104,75,56,62,72,98,121,142,137,167,201,208,231,266,285,313,330,361,352,321,301,301,302,298,278,259,257,256,250,248,238,209,190,175,135,121,108,78,79,72,69,83,110,151,183,205,218,223,231,250,266,283,308,340,373,416,454,478,454,421,399,372,353,355,337,299,302,277,267,269,260,263,260,259,256,249,258,261,266,272,262,227,184,114,74,41,45,57,66,74,74,74,80,80,77,87,101,112,124,136,162,165,188,236,280,324,401,397,353,305,257,276,263,240,187,158,151,131,115,91,78,68,64,72,112,143,178,200,252,280,274,258,219,174,148,133,118,105,97,84,77,63,45,37,45,54,84,117,142,176,221,243,292,323,354,344,367,383,328,430,352,295,247,243,249,247,245,250,241,196,191,167,143,127,150,170,179,188,187,172,160,174,193,201,205,217,188,159,152,117,103,99,92,83,74,54,39,28,7,1,4,2,1,3,18,59,91,136,166,184,216,256,253,291,284,258,229,212,210,227,193,167,150,134,118,94,72,67,99,148,155,130,95,85,93,89,48,28,40,58,51,18,2,6,15,2,1,0,1,3,3,1,2,0,0,0,1]

const totalKm = 66.6
const kmPerPoint = totalKm / (elevationData.length - 1)

// Compute segment info between aid stations
function getSegmentInfo(i) {
  if (i >= aidStations.length - 1) return null
  const curr = aidStations[i]
  const next = aidStations[i + 1]
  const segKm = (next.km - curr.km).toFixed(1)
  const segDplus = next.dplus - curr.dplus

  // Parse times to compute duration
  const [h1, m1] = curr.targetTime.split(':').map(Number)
  const [h2, m2] = next.targetTime.split(':').map(Number)
  const totalMin = (h2 * 60 + m2) - (h1 * 60 + m1)
  const hours = Math.floor(totalMin / 60)
  const mins = totalMin % 60
  const duration = hours > 0 ? `${hours}h${mins.toString().padStart(2, '0')}` : `${mins}min`

  return { segKm, segDplus, duration }
}

function dotColor(type) {
  if (type === 'start' || type === 'finish') return 'bg-amber-400'
  if (type === 'water') return 'bg-blue-400'
  return 'bg-emerald-400'
}

function dotBorder(type) {
  if (type === 'start' || type === 'finish') return 'ring-amber-400/30'
  if (type === 'water') return 'ring-blue-400/30'
  return 'ring-emerald-400/30'
}

// Chart.js config
const chartLabels = elevationData.map((_, i) => (i * kmPerPoint).toFixed(1))

const annotationLines = {}
aidStations.forEach((station, idx) => {
  const pointIndex = Math.round(station.km / kmPerPoint)
  annotationLines[`line${idx}`] = {
    type: 'line',
    xMin: pointIndex,
    xMax: pointIndex,
    borderColor: station.key ? 'rgba(245, 158, 11, 0.7)' : 'rgba(255, 255, 255, 0.25)',
    borderWidth: station.key ? 2 : 1,
    borderDash: [4, 4],
    label: {
      display: true,
      content: station.name.split(' — ')[0].replace('Départ', '🏁').replace('Arrivée', '🏁'),
      position: 'start',
      color: station.key ? '#f59e0b' : 'rgba(255,255,255,0.6)',
      font: { size: 10 },
      backgroundColor: 'transparent'
    }
  }
})

const chartData = {
  labels: chartLabels,
  datasets: [{
    data: elevationData,
    borderColor: '#10b981',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    fill: true,
    tension: 0.3,
    pointRadius: 0,
    borderWidth: 2
  }]
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      callbacks: {
        title: (items) => `km ${items[0].label}`,
        label: (item) => `${item.raw}m`
      }
    },
    annotation: {
      annotations: annotationLines
    }
  },
  scales: {
    x: {
      ticks: {
        callback: function(val, i) {
          const km = parseFloat(this.getLabelForValue(val))
          return km % 10 < kmPerPoint ? `${Math.round(km)}km` : ''
        },
        color: 'rgba(255,255,255,0.4)',
        maxRotation: 0
      },
      grid: { color: 'rgba(255,255,255,0.05)' }
    },
    y: {
      ticks: {
        color: 'rgba(255,255,255,0.4)',
        callback: (v) => `${v}m`
      },
      grid: { color: 'rgba(255,255,255,0.05)' }
    }
  }
}

// Check if annotation plugin is available
const hasAnnotation = ref(true)
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-6 space-y-8">
    <!-- Header -->
    <div class="text-center space-y-2">
      <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20">
        <Trophy class="w-5 h-5 text-amber-400" />
        <span class="text-amber-400 font-semibold text-sm">UTBA 2026 — Balcons d'Azur 68K</span>
      </div>
      <h1 class="text-2xl font-bold text-text-primary">Race Strategy</h1>
      <p class="text-text-muted text-sm">12 avril 2026 · Départ 5h30 · 66.6km · 3512m D+</p>
    </div>

    <!-- ===== SECTION 1: Pace Chart ===== -->
    <section class="space-y-4">
      <div class="flex items-center gap-2">
        <Clock class="w-5 h-5 text-accent-primary" />
        <h2 class="text-lg font-bold text-text-primary">Horaires de passage</h2>
      </div>

      <!-- Legend -->
      <div class="flex flex-wrap gap-4 text-xs text-text-muted">
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-400"></span> Ravito complet</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-blue-400"></span> Eau uniquement</span>
        <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400"></span> Départ / Arrivée</span>
      </div>

      <!-- Timeline -->
      <div class="relative">
        <template v-for="(station, i) in aidStations" :key="i">
          <!-- Station row -->
          <div
            class="flex items-start gap-3 py-3 px-3 rounded-xl transition-colors"
            :class="station.key ? 'bg-amber-500/10 border border-amber-500/20' : ''"
          >
            <!-- Dot + line -->
            <div class="flex flex-col items-center flex-shrink-0">
              <div
                class="w-4 h-4 rounded-full ring-4 flex-shrink-0"
                :class="[dotColor(station.type), dotBorder(station.type)]"
              ></div>
            </div>

            <!-- Info -->
            <div class="flex-1 min-w-0">
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-semibold text-text-primary text-sm leading-tight">
                    {{ station.name }}
                    <span v-if="station.key" class="text-amber-400 ml-1">⚠️ Ravito clé</span>
                  </p>
                  <p class="text-xs text-text-muted mt-0.5">
                    km {{ station.km }} · D+ {{ station.dplus }}m
                  </p>
                </div>
                <span class="text-lg font-bold text-text-primary font-mono whitespace-nowrap">
                  {{ station.targetTime }}
                </span>
              </div>
            </div>
          </div>

          <!-- Segment between stations -->
          <div
            v-if="getSegmentInfo(i)"
            class="flex items-center gap-3 py-1.5 pl-5"
          >
            <div class="w-0.5 h-6 bg-gray-700 ml-[7px] flex-shrink-0"></div>
            <p class="text-xs text-text-muted">
              → {{ getSegmentInfo(i).duration }}
              <span class="text-text-muted/60 ml-1">
                ({{ getSegmentInfo(i).segKm }}km · +{{ getSegmentInfo(i).segDplus }}m)
              </span>
            </p>
          </div>
        </template>
      </div>

      <!-- Warning card -->
      <div class="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20">
        <AlertTriangle class="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p class="text-sm font-semibold text-red-400">Signal d'alarme</p>
          <p class="text-sm text-red-300/80">PC8 après 11h40 → accélère le rythme pour tenir l'objectif</p>
        </div>
      </div>
    </section>

    <!-- ===== SECTION 2: Elevation Profile ===== -->
    <section class="space-y-4">
      <div class="flex items-center gap-2">
        <Mountain class="w-5 h-5 text-accent-primary" />
        <h2 class="text-lg font-bold text-text-primary">Profil du parcours</h2>
      </div>

      <div class="card bg-bg-secondary border border-border rounded-xl p-4">
        <div class="h-56 sm:h-64">
          <Line :data="chartData" :options="chartOptions" />
        </div>
      </div>
    </section>

    <!-- ===== SECTION 3: Nutrition Plan ===== -->
    <section class="space-y-4">
      <div class="flex items-center gap-2">
        <Utensils class="w-5 h-5 text-accent-primary" />
        <h2 class="text-lg font-bold text-text-primary">Plan nutrition</h2>
      </div>

      <!-- Summary -->
      <div class="px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
        <p class="text-sm text-emerald-300">
          <span class="font-semibold">Total estimé :</span> ~590g glucides
          · Sodium : 1 pastille/45min à partir de H3
          · Boire avant d'avoir soif
        </p>
      </div>

      <!-- Nutrition cards -->
      <div class="space-y-2">
        <div
          v-for="(item, i) in nutritionPlan"
          :key="i"
          class="px-4 py-3 rounded-xl bg-bg-secondary border border-border"
        >
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <span class="text-xs font-mono text-text-muted bg-bg-tertiary px-2 py-0.5 rounded">
                  {{ item.period }}
                </span>
                <span
                  v-if="item.glucides"
                  class="text-xs font-semibold text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full"
                >
                  {{ item.glucides }}g
                </span>
              </div>
              <p class="font-semibold text-text-primary text-sm mt-1.5">{{ item.action }}</p>
              <p class="text-xs text-text-muted mt-0.5">{{ item.detail }}</p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Spacer for mobile nav -->
    <div class="h-20"></div>
  </div>
</template>
