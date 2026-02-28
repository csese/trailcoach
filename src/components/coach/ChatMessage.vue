<script setup>
import { computed } from 'vue'
import PlanModificationCard from './PlanModificationCard.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['accept-change', 'reject-change'])

function escapeHtml(text) {
  if (!text) return ''
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderContent(text) {
  if (!text) return ''
  let html = escapeHtml(text)
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  // Lists — collect consecutive lines starting with -
  html = html.replace(/((?:^|\n)- .+(?:\n- .+)*)/g, (match) => {
    const items = match.trim().split('\n').map(line =>
      `<li>${line.replace(/^- /, '')}</li>`
    ).join('')
    return `<ul class="list-disc list-inside my-1">${items}</ul>`
  })
  // Paragraphs
  html = html.replace(/\n\n/g, '</p><p class="mt-2">')
  html = html.replace(/\n/g, '<br>')
  return `<p>${html}</p>`
}

function formatTime(timestamp) {
  if (!timestamp) return ''
  try {
    const d = new Date(timestamp)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<template>
  <div :class="['flex', message.role === 'user' ? 'justify-end' : 'justify-start']">
    <div :class="['max-w-[85%] rounded-2xl px-4 py-3 text-sm',
      message.role === 'user' ? 'bg-emerald-600 text-white' : 'bg-gray-800 text-gray-100']">
      <div v-html="renderContent(message.content)" class="prose-sm prose-invert" />
      <span v-if="message.streaming" class="animate-pulse">▋</span>
      <PlanModificationCard
        v-if="message.planChanges"
        :planChanges="message.planChanges"
        @accept="$emit('accept-change', $event)"
        @reject="$emit('reject-change', $event)"
      />
      <div v-if="message.timestamp" class="text-xs opacity-40 mt-1">{{ formatTime(message.timestamp) }}</div>
    </div>
  </div>
</template>
