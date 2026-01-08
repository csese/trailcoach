import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useUserStore = defineStore('user', () => {
  // State
  const displayName = ref('Athlete')
  const theme = ref('dark')

  // HR Zones based on user's data
  const hrZones = ref({
    z1: { min: 0, max: 129, label: 'Recovery', color: '#525252' },
    z2: { min: 130, max: 149, label: 'Aerobic', color: '#22c55e' },
    z3: { min: 150, max: 150, label: 'Threshold', color: '#f97316' },
    z4: { min: 151, max: 180, label: 'Hard', color: '#ef4444' },
    z5: { min: 181, max: 220, label: 'Max', color: '#dc2626' }
  })

  // Races
  const races = ref([
    { name: 'Balcons d\'Azur', distance: '68k', date: '2026-04-12', type: 'training' },
    { name: 'Gypaète', distance: '76k', date: '2026-06-06', type: 'key' },
    { name: 'Nice', distance: '110k', date: '2026-09-27', type: 'goal' }
  ])

  // Load settings from localStorage
  function loadSettings() {
    const stored = localStorage.getItem('trailcoach-settings')
    if (stored) {
      const settings = JSON.parse(stored)
      displayName.value = settings.displayName || 'Athlete'
      theme.value = settings.theme || 'dark'
      if (settings.hrZones) {
        hrZones.value = settings.hrZones
      }
    }
  }

  // Save settings
  function saveSettings() {
    localStorage.setItem('trailcoach-settings', JSON.stringify({
      displayName: displayName.value,
      theme: theme.value,
      hrZones: hrZones.value
    }))
  }

  // Update display name
  function setDisplayName(name) {
    displayName.value = name
    saveSettings()
  }

  // Update theme
  function setTheme(newTheme) {
    theme.value = newTheme
    saveSettings()

    // Apply to document
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  // Update HR zones
  function setHrZones(zones) {
    hrZones.value = zones
    saveSettings()
  }

  // Get zone for a given HR
  function getZoneForHr(hr) {
    for (const [key, zone] of Object.entries(hrZones.value)) {
      if (hr >= zone.min && hr <= zone.max) {
        return { key, ...zone }
      }
    }
    return null
  }

  // Days until next race
  const daysUntilNextRace = computed(() => {
    const today = new Date()
    const upcoming = races.value
      .map(r => ({ ...r, dateObj: new Date(r.date) }))
      .filter(r => r.dateObj > today)
      .sort((a, b) => a.dateObj - b.dateObj)[0]

    if (!upcoming) return null

    const diffTime = upcoming.dateObj - today
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    return { race: upcoming, days: diffDays }
  })

  return {
    displayName,
    theme,
    hrZones,
    races,
    daysUntilNextRace,
    loadSettings,
    saveSettings,
    setDisplayName,
    setTheme,
    setHrZones,
    getZoneForHr
  }
})
