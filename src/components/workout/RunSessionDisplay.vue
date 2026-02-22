<script setup>
import { computed } from 'vue'

const props = defineProps({
  workout: { type: Object, required: true }
})

const meta = computed(() => props.workout?.runMeta)
const isRace = computed(() => {
  const st = props.workout?.SessionType || props.workout?.['Session Type'] || ''
  return st.toUpperCase().includes('RACE:')
})
const raceName = computed(() => {
  const st = props.workout?.SessionType || props.workout?.['Session Type'] || ''
  return st.replace(/^RACE:\s*/i, '')
})

const zoneColors = {
  'Z1': { bg: 'rgba(96, 165, 250, 0.2)', border: 'rgb(96, 165, 250)', text: '#60a5fa' },
  'Z2': { bg: 'rgba(74, 222, 128, 0.2)', border: 'rgb(74, 222, 128)', text: '#4ade80' },
  'Z3': { bg: 'rgba(250, 204, 21, 0.2)', border: 'rgb(250, 204, 21)', text: '#facc15' },
  'Z4': { bg: 'rgba(251, 146, 60, 0.2)', border: 'rgb(251, 146, 60)', text: '#fb923c' },
  'Z5': { bg: 'rgba(248, 113, 113, 0.2)', border: 'rgb(248, 113, 113)', text: '#f87171' },
}

function getZoneColor(zone) {
  // Handle compound zones like "Z1-Z2", "Z3-Z4"
  const match = zone?.match(/Z(\d)/)
  if (!match) return zoneColors['Z2']
  return zoneColors[`Z${match[1]}`] || zoneColors['Z2']
}

function getZoneStyle(zone) {
  const c = getZoneColor(zone)
  return { backgroundColor: c.bg, borderColor: c.border, color: c.text }
}

// For the zone bar: which zones are active
const allZones = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5']
const activeZones = computed(() => {
  if (!meta.value?.zones) return []
  return meta.value.zones
})

function isZoneActive(z) {
  return activeZones.value.includes(z)
}

function isPrimaryZone(z) {
  const pz = meta.value?.primaryZone || ''
  return pz.includes(z)
}
</script>

<template>
  <div v-if="meta" class="run-session-display space-y-4">
    <!-- Race Header -->
    <div v-if="isRace" class="race-header text-center py-4">
      <div class="text-xs uppercase tracking-widest text-orange-400 mb-1">🏁 Race Day</div>
      <h2 class="text-xl font-bold text-white">{{ raceName }}</h2>
    </div>

    <!-- Key Metrics Grid -->
    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div v-if="meta.distance" class="metric-card">
        <span class="metric-icon">📍</span>
        <span class="metric-label">Distance</span>
        <span class="metric-value">{{ meta.distance }}</span>
      </div>
      <div v-if="meta.elevationGain" class="metric-card">
        <span class="metric-icon">⛰️</span>
        <span class="metric-label">D+</span>
        <span class="metric-value">{{ meta.elevationGain }}</span>
      </div>
      <div v-if="meta.primaryZone" class="metric-card">
        <span class="metric-icon">💓</span>
        <span class="metric-label">Zone</span>
        <span class="metric-value" :style="{ color: getZoneColor(meta.primaryZone).text }">{{ meta.primaryZone }}</span>
      </div>
      <div v-if="meta.terrain" class="metric-card">
        <span class="metric-icon">🏔️</span>
        <span class="metric-label">Terrain</span>
        <span class="metric-value">{{ meta.terrain }}</span>
      </div>
    </div>

    <!-- Why This Session -->
    <div v-if="meta.why" class="why-section">
      <div class="why-header">
        <span class="why-icon">🎯</span>
        <span class="why-title">WHY THIS SESSION</span>
      </div>
      <p class="why-text">{{ meta.why }}</p>
    </div>

    <!-- HR Zone Bar -->
    <div v-if="meta.zones && meta.zones.length" class="zone-bar-section">
      <div class="zone-bar">
        <div
          v-for="z in allZones"
          :key="z"
          class="zone-segment"
          :class="{ active: isZoneActive(z), primary: isPrimaryZone(z) }"
          :style="{
            backgroundColor: isZoneActive(z) ? getZoneColor(z).border : 'rgba(255,255,255,0.06)',
            opacity: isPrimaryZone(z) ? 1 : isZoneActive(z) ? 0.5 : 0.15
          }"
        >
          <span class="zone-label">{{ z }}</span>
        </div>
      </div>
      <div v-if="meta.hrRange" class="text-center text-xs text-text-muted mt-1.5">
        {{ meta.hrRange }} bpm
      </div>
    </div>

    <!-- Session Blocks -->
    <div v-if="meta.blocks && meta.blocks.length" class="blocks-section">
      <h4 class="section-title">{{ isRace ? '🗺️ Race Strategy' : '📋 Session Blocks' }}</h4>
      <div class="blocks-flow">
        <div
          v-for="(block, i) in meta.blocks"
          :key="i"
          class="block-card"
          :style="{
            borderLeftColor: getZoneColor(block.zone).border,
            borderLeftWidth: '3px'
          }"
        >
          <div class="block-header">
            <span class="block-name">{{ block.name }}</span>
            <span class="block-duration">{{ block.duration }}</span>
          </div>
          <div class="block-zone" :style="{ color: getZoneColor(block.zone).text }">{{ block.zone }}</div>
          <div class="block-desc">{{ block.description }}</div>
        </div>
      </div>
    </div>

    <!-- Key Focus -->
    <div v-if="meta.keyFocus" class="focus-section">
      <span class="section-icon">🎯</span>
      <span class="focus-text">{{ meta.keyFocus }}</span>
    </div>

    <!-- Nutrition -->
    <div v-if="meta.nutrition" class="nutrition-section">
      <span class="section-icon">🍌</span>
      <span class="nutrition-text">{{ meta.nutrition }}</span>
    </div>
  </div>
</template>

<style scoped>
.run-session-display {
  font-family: inherit;
}

.race-header {
  background: linear-gradient(135deg, rgba(251, 146, 60, 0.15), rgba(248, 113, 113, 0.1));
  border: 1px solid rgba(251, 146, 60, 0.3);
  border-radius: 12px;
}

.metric-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
  border-radius: 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
}

.metric-icon {
  font-size: 1.1rem;
  margin-bottom: 2px;
}

.metric-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, rgba(255,255,255,0.45));
}

.metric-value {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

/* Zone Bar */
.zone-bar-section {
  padding: 8px 0;
}

.zone-bar {
  display: flex;
  gap: 3px;
  border-radius: 8px;
  overflow: hidden;
}

.zone-segment {
  flex: 1;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  border-radius: 4px;
}

.zone-label {
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(255,255,255,0.9);
}

.zone-segment:not(.active) .zone-label {
  color: rgba(255,255,255,0.25);
}

/* Blocks */
.blocks-section {
  padding-top: 4px;
}

.section-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted, rgba(255,255,255,0.45));
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.blocks-flow {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.block-card {
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 10px 12px;
  border-left-style: solid;
}

.block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2px;
}

.block-name {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-primary, #fff);
}

.block-duration {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted, rgba(255,255,255,0.45));
  font-family: monospace;
}

.block-zone {
  font-size: 0.7rem;
  font-weight: 600;
  margin-bottom: 2px;
}

.block-desc {
  font-size: 0.75rem;
  color: var(--text-secondary, rgba(255,255,255,0.65));
  line-height: 1.4;
}

/* Why This Session */
.why-section {
  padding: 12px 14px;
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
  border-radius: 10px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-left: 3px solid rgb(250, 204, 21);
}

.why-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}

.why-icon {
  font-size: 0.9rem;
}

.why-title {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgb(250, 204, 21);
}

.why-text {
  font-size: 0.8rem;
  color: var(--text-secondary, rgba(255,255,255,0.65));
  line-height: 1.5;
  margin: 0;
}

/* Focus & Nutrition */
.focus-section,
.nutrition-section {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-tertiary, rgba(255,255,255,0.04));
  border-radius: 8px;
  border: 1px solid var(--border, rgba(255,255,255,0.08));
}

.section-icon {
  font-size: 1rem;
  flex-shrink: 0;
}

.focus-text,
.nutrition-text {
  font-size: 0.8rem;
  color: var(--text-secondary, rgba(255,255,255,0.65));
  line-height: 1.4;
}
</style>
