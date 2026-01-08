<script setup>
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSupabase } from '@/composables/useSupabase'
import { Mountain, Mail, Lock, User, AlertCircle } from 'lucide-vue-next'

const router = useRouter()
const { signIn, signUp, getUser, isConfigured } = useSupabase()

const mode = ref('signin') // 'signin' or 'signup'
const email = ref('')
const password = ref('')
const name = ref('')
const loading = ref(false)
const error = ref('')

onMounted(async () => {
  // Check if already logged in
  const user = await getUser()
  if (user) {
    router.push('/')
  }
})

async function handleSubmit() {
  if (!email.value || !password.value) {
    error.value = 'Please fill in all fields'
    return
  }

  loading.value = true
  error.value = ''

  try {
    if (mode.value === 'signin') {
      await signIn(email.value, password.value)
    } else {
      await signUp(email.value, password.value)
    }
    router.push('/')
  } catch (err) {
    error.value = err.message || 'Authentication failed'
  } finally {
    loading.value = false
  }
}

function toggleMode() {
  mode.value = mode.value === 'signin' ? 'signup' : 'signin'
  error.value = ''
}

function continueAsGuest() {
  router.push('/')
}
</script>

<template>
  <div class="min-h-screen bg-bg-primary flex items-center justify-center p-4">
    <div class="w-full max-w-md">
      <!-- Logo -->
      <div class="text-center mb-8">
        <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-primary mb-4">
          <Mountain class="w-8 h-8 text-white" />
        </div>
        <h1 class="text-2xl font-bold text-text-primary">TrailCoach</h1>
        <p class="text-text-muted mt-1">Your ultra-trail training companion</p>
      </div>

      <!-- Not configured warning -->
      <div v-if="!isConfigured" class="card mb-6 border-yellow-500/30 bg-yellow-500/10">
        <div class="flex items-start gap-3">
          <AlertCircle class="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <p class="text-sm text-yellow-500 font-medium">Supabase not configured</p>
            <p class="text-xs text-text-muted mt-1">
              Cloud sync is disabled. Your data will be stored locally.
              To enable cloud sync, add your Supabase credentials to the .env file.
            </p>
          </div>
        </div>
      </div>

      <!-- Auth form -->
      <div class="card" v-if="isConfigured">
        <h2 class="text-xl font-semibold text-text-primary mb-6">
          {{ mode === 'signin' ? 'Welcome back' : 'Create account' }}
        </h2>

        <form @submit.prevent="handleSubmit" class="space-y-4">
          <!-- Name (signup only) -->
          <div v-if="mode === 'signup'">
            <label class="block text-sm text-text-muted mb-1">Name</label>
            <div class="relative">
              <User class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                v-model="name"
                type="text"
                class="input pl-10"
                placeholder="Your name"
              />
            </div>
          </div>

          <!-- Email -->
          <div>
            <label class="block text-sm text-text-muted mb-1">Email</label>
            <div class="relative">
              <Mail class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                v-model="email"
                type="email"
                class="input pl-10"
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <!-- Password -->
          <div>
            <label class="block text-sm text-text-muted mb-1">Password</label>
            <div class="relative">
              <Lock class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-text-muted" />
              <input
                v-model="password"
                type="password"
                class="input pl-10"
                placeholder="••••••••"
                required
                minlength="6"
              />
            </div>
          </div>

          <!-- Error -->
          <div v-if="error" class="p-3 rounded-lg bg-status-missed/10 border border-status-missed/30">
            <p class="text-sm text-status-missed">{{ error }}</p>
          </div>

          <!-- Submit -->
          <button
            type="submit"
            class="btn-primary w-full"
            :disabled="loading"
          >
            {{ loading ? 'Loading...' : (mode === 'signin' ? 'Sign In' : 'Sign Up') }}
          </button>
        </form>

        <!-- Toggle mode -->
        <p class="text-center text-sm text-text-muted mt-6">
          {{ mode === 'signin' ? "Don't have an account?" : 'Already have an account?' }}
          <button
            @click="toggleMode"
            class="text-accent-primary hover:underline ml-1"
          >
            {{ mode === 'signin' ? 'Sign up' : 'Sign in' }}
          </button>
        </p>
      </div>

      <!-- Continue as guest -->
      <div class="text-center mt-6">
        <button
          @click="continueAsGuest"
          class="text-text-muted hover:text-text-primary transition-colors"
        >
          Continue without account →
        </button>
        <p class="text-xs text-text-muted mt-2">
          Data will be stored locally in your browser
        </p>
      </div>
    </div>
  </div>
</template>
