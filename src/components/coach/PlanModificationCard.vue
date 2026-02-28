<script setup>
import { ref, computed } from 'vue'
import { Pencil } from 'lucide-vue-next'

const props = defineProps({
  planChanges: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['accept', 'reject'])

const localChanges = ref(
  (props.planChanges.changes || []).map(c => ({ ...c, status: c.status || 'pending' }))
)

const hasPending = computed(() => localChanges.value.some(c => c.status === 'pending'))

function accept(change) {
  change.status = 'accepted'
  emit('accept', { workoutId: change.workoutId, field: change.field, to: change.to })
}

function reject(change) {
  change.status = 'rejected'
  emit('reject', { workoutId: change.workoutId, field: change.field })
}

function acceptAll() {
  localChanges.value.filter(c => c.status === 'pending').forEach(c => accept(c))
}

function rejectAll() {
  localChanges.value.filter(c => c.status === 'pending').forEach(c => reject(c))
}
</script>

<template>
  <div class="mt-3 border border-emerald-500/30 rounded-xl overflow-hidden">
    <div class="bg-emerald-500/10 px-3 py-2 flex items-center gap-2">
      <Pencil :size="14" class="text-emerald-400" />
      <span class="text-emerald-400 text-xs font-semibold">Plan modification proposal</span>
    </div>
    <div class="p-3 text-xs text-gray-300 italic border-b border-gray-700">{{ planChanges.summary }}</div>
    <div class="divide-y divide-gray-700">
      <div v-for="change in localChanges" :key="change.workoutId + change.field" class="p-3 flex flex-col gap-1">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-xs text-gray-400">{{ change.workoutId }} · {{ change.field }}</div>
            <div class="text-xs">
              <span class="line-through text-red-400">{{ change.from }}</span>
              → <span class="text-emerald-400">{{ change.to }}</span>
            </div>
            <div class="text-xs text-gray-400 mt-0.5">{{ change.reason }}</div>
          </div>
          <div v-if="change.status === 'pending'" class="flex gap-1 shrink-0">
            <button @click="accept(change)" class="text-xs bg-emerald-600 hover:bg-emerald-500 text-white px-2 py-1 rounded">✓</button>
            <button @click="reject(change)" class="text-xs bg-gray-700 hover:bg-gray-600 text-white px-2 py-1 rounded">✕</button>
          </div>
          <div v-else-if="change.status === 'accepted'" class="text-emerald-400 text-xs shrink-0">✓ Applied</div>
          <div v-else-if="change.status === 'rejected'" class="text-gray-500 text-xs shrink-0">✕ Skipped</div>
        </div>
      </div>
    </div>
    <div v-if="hasPending" class="px-3 py-2 flex gap-2 bg-gray-900">
      <button @click="acceptAll" class="text-xs text-emerald-400 hover:text-emerald-300">Accept all</button>
      <button @click="rejectAll" class="text-xs text-gray-500 hover:text-gray-400 ml-auto">Reject all</button>
    </div>
  </div>
</template>
