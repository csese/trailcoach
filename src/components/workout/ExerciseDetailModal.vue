<script setup>
import { computed } from 'vue'
import { X, Dumbbell, ChevronLeft, Mountain, CheckCircle } from 'lucide-vue-next'

const props = defineProps({
  show: { type: Boolean, default: false },
  exercise: { type: Object, default: null }
})

const emit = defineEmits(['close'])

const categoryColors = {
  legs: 'bg-blue-500/20 text-blue-400',
  core: 'bg-amber-500/20 text-amber-400',
  upper: 'bg-purple-500/20 text-purple-400',
  mobility: 'bg-emerald-500/20 text-emerald-400',
  plyometric: 'bg-red-500/20 text-red-400'
}

const categoryColor = computed(() => {
  return categoryColors[props.exercise?.category] || 'bg-gray-500/20 text-gray-400'
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="show && exercise"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4"
      >
        <div class="absolute inset-0 bg-black/70 backdrop-blur-sm" @click="emit('close')"></div>

        <div class="relative w-full max-w-lg max-h-[85vh] overflow-y-auto bg-bg-secondary rounded-2xl border border-border shadow-modal animate-slide-up">
          <!-- Header -->
          <div class="sticky top-0 bg-bg-secondary border-b border-border p-5 flex items-start justify-between">
            <div>
              <div class="flex items-center gap-2 mb-1">
                <Dumbbell class="w-5 h-5 text-accent-primary" />
                <h2 class="text-lg font-bold text-text-primary">{{ exercise.name }}</h2>
              </div>
              <span :class="['text-xs font-medium px-2.5 py-0.5 rounded-full capitalize', categoryColor]">
                {{ exercise.category }}
              </span>
            </div>
            <button @click="emit('close')" class="btn-ghost p-2 -mr-2 -mt-2">
              <X class="w-5 h-5" />
            </button>
          </div>

          <div class="p-5 space-y-5">
            <!-- Muscles -->
            <div>
              <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Muscles Worked</h3>
              <div class="flex flex-wrap gap-2">
                <span
                  v-for="muscle in exercise.muscles"
                  :key="muscle"
                  class="text-xs bg-bg-tertiary text-text-secondary px-2.5 py-1 rounded-full capitalize"
                >
                  {{ muscle }}
                </span>
              </div>
            </div>

            <!-- Description -->
            <div>
              <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">How To Do It</h3>
              <p class="text-sm text-text-secondary leading-relaxed">{{ exercise.description }}</p>
            </div>

            <!-- Coaching Cues -->
            <div>
              <h3 class="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Coaching Cues</h3>
              <ul class="space-y-2">
                <li
                  v-for="cue in exercise.cues"
                  :key="cue"
                  class="flex items-start gap-2.5"
                >
                  <CheckCircle class="w-4 h-4 text-accent-primary mt-0.5 shrink-0" />
                  <span class="text-sm text-text-secondary">{{ cue }}</span>
                </li>
              </ul>
            </div>

            <!-- Trail Benefit -->
            <div class="card bg-accent-primary/10 border border-accent-primary/20">
              <div class="flex items-start gap-3">
                <Mountain class="w-5 h-5 text-accent-primary mt-0.5 shrink-0" />
                <div>
                  <h3 class="text-xs font-semibold text-accent-primary uppercase tracking-wide mb-1">Trail Running Benefit</h3>
                  <p class="text-sm text-text-secondary leading-relaxed">{{ exercise.trailBenefit }}</p>
                </div>
              </div>
            </div>

            <!-- Back button -->
            <button @click="emit('close')" class="btn-ghost w-full flex items-center justify-center gap-2">
              <ChevronLeft class="w-4 h-4" />
              Back to workout
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
.modal-enter-active .animate-slide-up,
.modal-leave-active .animate-slide-up {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.modal-enter-from .animate-slide-up,
.modal-leave-to .animate-slide-up {
  opacity: 0;
  transform: translateY(20px);
}
</style>
