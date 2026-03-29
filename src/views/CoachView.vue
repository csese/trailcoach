<script setup>
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { Send } from 'lucide-vue-next'
import { useCoach } from '@/composables/useCoach'
import { useWorkoutsStore } from '@/stores/workouts'
import { useLogsStore } from '@/stores/logs'
import { buildCoachContext } from '@/utils/coachContext'
import { useAdaptationsStore } from '@/stores/adaptations'
import ChatMessage from '@/components/coach/ChatMessage.vue'

const workoutsStore = useWorkoutsStore()
const logsStore = useLogsStore()
const adaptationsStore = useAdaptationsStore()

const { messages, isStreaming, streamingContent, error, sendMessage, clearConversation, loadMessages } = useCoach()

const input = ref('')
const messagesEl = ref(null)
const isReady = ref(false)

const suggestedPrompts = [
  "How's my training load looking this week?",
  "Should I change anything before Balcons?",
  "I had a rough long run yesterday, what should I adjust?",
  "Explain my current training phase"
]

const contextSummary = computed(() => {
  try {
    const ctx = buildCoachContext({ workoutsStore, logsStore, adaptationsStore, stravaTokens: null })
    const parts = [`Week ${ctx.athlete.currentWeek}`, ctx.athlete.currentPhase]
    if (ctx.loadMetrics?.tsb != null) parts.push(`TSB: ${ctx.loadMetrics.tsb.toFixed(0)}`)
    return parts.join(' · ')
  } catch {
    return 'Loading...'
  }
})

function send() {
  if (!input.value.trim() || isStreaming.value) return
  const text = input.value
  input.value = ''
  sendMessage(text)
}

function sendSuggested(prompt) {
  input.value = ''
  sendMessage(prompt)
}

function acceptChange(change) {
  try {
    const overrides = JSON.parse(localStorage.getItem('trailcoach-workout-overrides') || '{}')
    const fieldMap = {
      'PlannedDuration': 'customPlannedDuration',
      'SessionType': 'customSessionType',
      'TargetHRZone': 'customTargetHrZone',
      'Details': 'customDetails',
      'Focus': 'customFocus',
      'WorkoutDescription': 'customWorkoutDescription'
    }
    const key = fieldMap[change.field] || `custom${change.field}`
    if (!overrides[change.workoutId]) overrides[change.workoutId] = {}
    overrides[change.workoutId][key] = change.to
    localStorage.setItem('trailcoach-workout-overrides', JSON.stringify(overrides))
    workoutsStore.loadWorkouts()
  } catch (e) {
    console.error('Failed to apply change:', e)
  }
}

function rejectChange(change) {
  // No-op — already handled visually in PlanModificationCard
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesEl.value) {
      messagesEl.value.scrollTop = messagesEl.value.scrollHeight
    }
  })
}

watch([messages, streamingContent], scrollToBottom)

onMounted(async () => {
  loadMessages()
  await Promise.all([
    workoutsStore.loadWorkouts(),
    logsStore.loadLogs(),
    adaptationsStore.loadProposals()
  ])
  isReady.value = true
})
</script>

<template>
  <div class="flex flex-col h-full bg-gray-950">
    <!-- Header -->
    <div class="flex items-center gap-3 p-4 border-b border-gray-800">
      <div class="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white text-sm">🏔️</div>
      <div>
        <div class="font-semibold text-white">Coach</div>
        <div class="text-xs text-gray-400">{{ contextSummary }}</div>
      </div>
      <button @click="clearConversation" class="ml-auto text-gray-500 hover:text-gray-300 text-xs">Clear</button>
    </div>

    <!-- Messages -->
    <div ref="messagesEl" class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Empty state -->
      <div v-if="messages.length === 0 && !isStreaming" class="flex flex-col items-center justify-center h-full gap-6">
        <div class="text-center">
          <div class="text-4xl mb-2">🏔️</div>
          <h2 class="text-lg font-semibold text-white">Ask your coach</h2>
          <p class="text-sm text-gray-400 mt-1">Get personalized advice based on your training data</p>
        </div>
        <div class="flex flex-wrap gap-2 justify-center max-w-md">
          <button
            v-for="prompt in suggestedPrompts"
            :key="prompt"
            @click="sendSuggested(prompt)"
            class="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg transition-colors"
          >
            {{ prompt }}
          </button>
        </div>
      </div>

      <!-- Messages -->
      <ChatMessage
        v-for="msg in messages"
        :key="msg.id"
        :message="msg"
        @accept-change="acceptChange"
        @reject-change="rejectChange"
      />

      <!-- Streaming bubble -->
      <ChatMessage
        v-if="isStreaming"
        :message="{ role: 'assistant', content: streamingContent || '...', streaming: true }"
      />

      <!-- Error -->
      <div v-if="error" class="text-center text-red-400 text-sm py-2">
        {{ error }}
      </div>
    </div>

    <!-- Input -->
    <div class="p-4 border-t border-gray-800">
      <div class="flex gap-2">
        <textarea
          v-model="input"
          @keydown.enter.exact.prevent="send"
          rows="1"
          class="flex-1 bg-gray-800 text-white rounded-lg px-3 py-2 resize-none text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
          :disabled="!isReady"
          :placeholder="isReady ? 'Ask your coach...' : 'Loading training data...'"
        />
        <button
          @click="send"
          :disabled="isStreaming || !input.trim()"
          class="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Send :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>
