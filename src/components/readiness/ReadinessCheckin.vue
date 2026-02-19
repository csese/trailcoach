<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { format } from 'date-fns'
import { useReadinessStore } from '@/stores/readiness'

const readinessStore = useReadinessStore()
const today = format(new Date(), 'yyyy-MM-dd')

const selectedFeel = ref(null)
const saved = ref(false)
let saveTimeout = null

const legFeelOptions = [
  { emoji: '💀', label: 'Wrecked', desc: 'Heavy, sore, struggling', value: 2 },
  { emoji: '😴', label: 'Tired', desc: 'Sluggish but manageable', value: 4 },
  { emoji: '👍', label: 'Good', desc: 'Feeling solid', value: 7 },
  { emoji: '💪', label: 'Fresh', desc: 'Ready to go', value: 9 }
]

const existingEntry = computed(() => readinessStore.getEntryByDate(today))

onMounted(() => {
  readinessStore.loadEntries()
})

watch(existingEntry, (entry) => {
  if (entry) {
    const match = legFeelOptions.find(o => o.value === entry.readinessScore)
    selectedFeel.value = match ? match.value : null
  }
}, { immediate: true })

async function selectLegFeel(option) {
  selectedFeel.value = option.value
  
  await readinessStore.saveEntry({
    date: today,
    sleep: 5,
    soreness: 5,
    stress: 5,
    mood: 5,
    motivation: 5,
    pain: 1,
    notes: '',
    readinessScore: option.value
  })

  saved.value = true
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => { saved.value = false }, 2000)
}
</script>

<template>
  <div class="card">
    <div class="flex items-center justify-between mb-4">
      <h3 class="text-lg font-semibold text-text-primary">How are your legs today?</h3>
      <Transition name="fade">
        <span v-if="saved" class="text-sm text-status-completed font-medium">Saved ✓</span>
      </Transition>
    </div>

    <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
      <button
        v-for="option in legFeelOptions"
        :key="option.value"
        @click="selectLegFeel(option)"
        class="flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200"
        :class="[
          selectedFeel === option.value
            ? 'border-accent-primary bg-accent-primary/10 scale-[1.02]'
            : 'border-border bg-bg-tertiary hover:border-text-muted hover:bg-bg-hover'
        ]"
      >
        <span class="text-3xl">{{ option.emoji }}</span>
        <span class="text-sm font-semibold text-text-primary">{{ option.label }}</span>
        <span class="text-xs text-text-muted text-center">{{ option.desc }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
