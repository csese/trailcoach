<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { apiFetch } from '@/composables/useApi'
import { Loader2, AlertCircle } from 'lucide-vue-next'

const router = useRouter()
const route = useRoute()
const status = ref('Connecting Google Health…')
const error = ref('')

onMounted(async () => {
  try {
    const code = route.query.code
    if (!code) {
      throw new Error(route.query.error === 'access_denied'
        ? 'Authorization was cancelled'
        : (route.query.error || 'No authorization code received'))
    }

    status.value = 'Finishing authorization…'
    await apiFetch('/api/google-health/token', {
      code,
      redirect_uri: `${window.location.origin}/auth/google-health/callback`
    })

    status.value = 'Running first sync…'
    await apiFetch('/api/integrations/sync', { provider: 'google_health' })

    router.push('/settings')
  } catch (e) {
    error.value = e.message
  }
})
</script>

<template>
  <div class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
    <div class="card w-full max-w-md text-center py-8">
      <template v-if="!error">
        <Loader2 class="w-8 h-8 animate-spin text-accent-primary mx-auto mb-4" />
        <p class="text-text-primary font-medium">{{ status }}</p>
      </template>
      <template v-else>
        <AlertCircle class="w-8 h-8 text-red-500 mx-auto mb-4" />
        <p class="text-red-500 font-medium mb-2">Google Health connection failed</p>
        <p class="text-sm text-text-muted mb-6">{{ error }}</p>
        <button @click="router.push('/settings')" class="btn-primary">Back to Settings</button>
      </template>
    </div>
  </div>
</template>
