<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStrava } from '@/composables/useStrava'
import { Loader2, CheckCircle2, XCircle } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const { exchangeToken } = useStrava()

const status = ref('processing') // 'processing', 'success', 'error'
const message = ref('Connecting to Strava...')

onMounted(async () => {
  const code = route.query.code
  const error = route.query.error

  if (error) {
    status.value = 'error'
    message.value = 'Authorization was denied or cancelled'
    setTimeout(() => router.push('/settings'), 3000)
    return
  }

  if (!code) {
    status.value = 'error'
    message.value = 'No authorization code received'
    setTimeout(() => router.push('/settings'), 3000)
    return
  }

  try {
    await exchangeToken(code)
    status.value = 'success'
    message.value = 'Successfully connected to Strava!'
    setTimeout(() => router.push('/settings'), 2000)
  } catch (err) {
    status.value = 'error'
    message.value = err.message || 'Failed to connect to Strava'
    setTimeout(() => router.push('/settings'), 3000)
  }
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
    <div class="card text-center max-w-md w-full">
      <!-- Processing -->
      <div v-if="status === 'processing'" class="py-8">
        <Loader2 class="w-12 h-12 text-accent-primary animate-spin mx-auto mb-4" />
        <p class="text-text-primary font-medium">{{ message }}</p>
      </div>

      <!-- Success -->
      <div v-else-if="status === 'success'" class="py-8">
        <div class="w-16 h-16 rounded-full bg-status-completed/20 flex items-center justify-center mx-auto mb-4">
          <CheckCircle2 class="w-8 h-8 text-status-completed" />
        </div>
        <p class="text-text-primary font-medium">{{ message }}</p>
        <p class="text-sm text-text-muted mt-2">Redirecting to settings...</p>
      </div>

      <!-- Error -->
      <div v-else class="py-8">
        <div class="w-16 h-16 rounded-full bg-status-missed/20 flex items-center justify-center mx-auto mb-4">
          <XCircle class="w-8 h-8 text-status-missed" />
        </div>
        <p class="text-text-primary font-medium">{{ message }}</p>
        <p class="text-sm text-text-muted mt-2">Redirecting to settings...</p>
      </div>
    </div>
  </div>
</template>
