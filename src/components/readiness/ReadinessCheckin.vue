<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { format } from 'date-fns'
import { useReadinessStore } from '@/stores/readiness'
import { Heart, Save } from 'lucide-vue-next'

const readinessStore = useReadinessStore()
const today = format(new Date(), 'yyyy-MM-dd')

const sleep = ref(5)
const soreness = ref(5)
const stress = ref(5)
const mood = ref(5)
const motivation = ref(5)
const pain = ref(1)
const notes = ref('')

const readinessScore = computed(() => readinessStore.calculateReadinessScore({
  sleep: sleep.value,
  soreness: soreness.value,
  stress: stress.value,
  mood: mood.value,
  motivation: motivation.value,
  pain: pain.value
}))

const existingEntry = computed(() => readinessStore.getEntryByDate(today))

onMounted(() => {
  readinessStore.loadEntries()
})

watch(existingEntry, (entry) => {
  if (!entry) {
    sleep.value = 5
    soreness.value = 5
    stress.value = 5
    mood.value = 5
    motivation.value = 5
    pain.value = 1
    notes.value = ''
    return
  }
  sleep.value = entry.sleep ?? 5
  soreness.value = entry.soreness ?? 5
  stress.value = entry.stress ?? 5
  mood.value = entry.mood ?? 5
  motivation.value = entry.motivation ?? 5
  pain.value = entry.pain ?? 1
  notes.value = entry.notes || ''
}, { immediate: true })

async function saveCheckin() {
  await readinessStore.saveEntry({
    date: today,
    sleep: sleep.value,
    soreness: soreness.value,
    stress: stress.value,
    mood: mood.value,
    motivation: motivation.value,
    pain: pain.value,
    notes: notes.value,
    readinessScore: readinessScore.value
  })
}
</script>

<template>
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <div class="flex items-center gap-2">
        <Heart class="w-5 h-5 text-text-muted" />
        <h3 class="text-lg font-semibold text-text-primary">Daily Readiness</h3>
      </div>
      <div class="text-right">
        <p class="text-xs text-text-muted">Today</p>
        <p class="text-lg font-mono font-semibold text-accent-primary">{{ readinessScore }}/10</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
      <div>
        <label class="block text-xs text-text-muted mb-1">Sleep Quality</label>
        <input v-model.number="sleep" type="range" min="1" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
      <div>
        <label class="block text-xs text-text-muted mb-1">Soreness</label>
        <input v-model.number="soreness" type="range" min="1" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
      <div>
        <label class="block text-xs text-text-muted mb-1">Stress</label>
        <input v-model.number="stress" type="range" min="1" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
      <div>
        <label class="block text-xs text-text-muted mb-1">Mood</label>
        <input v-model.number="mood" type="range" min="1" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
      <div>
        <label class="block text-xs text-text-muted mb-1">Motivation</label>
        <input v-model.number="motivation" type="range" min="1" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
      <div>
        <label class="block text-xs text-text-muted mb-1">Pain / Discomfort</label>
        <input v-model.number="pain" type="range" min="0" max="10" class="w-full h-2 bg-bg-tertiary rounded-lg appearance-none cursor-pointer accent-accent-primary" />
      </div>
    </div>

    <div class="mb-4">
      <label class="block text-xs text-text-muted mb-1">Notes (optional)</label>
      <textarea v-model="notes" class="input min-h-[70px]" placeholder="Any context for today?"></textarea>
    </div>

    <div class="flex items-center justify-between">
      <p v-if="readinessStore.recentAverage" class="text-xs text-text-muted">
        7-day avg: <span class="text-text-primary font-medium">{{ readinessStore.recentAverage }}</span>
      </p>
      <div v-else></div>
      <button @click="saveCheckin" class="btn-primary flex items-center gap-2">
        <Save class="w-4 h-4" />
        {{ existingEntry ? 'Update' : 'Save' }} Check-in
      </button>
    </div>
  </div>
</template>
