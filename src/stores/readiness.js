import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { format, parseISO, subDays } from 'date-fns'
import { useSupabase } from '@/composables/useSupabase'
import { clamp } from '@/utils/duration'

const STORAGE_KEY = 'trailcoach-readiness'

function normalizeEntry(entry) {
  const toNumber = (value, fallback) => {
    if (value === null || value === undefined || value === '') return fallback
    const num = Number(value)
    return Number.isNaN(num) ? fallback : num
  }

  return {
    id: entry.id || `readiness-${entry.date || entry.entry_date}-${Date.now()}`,
    date: entry.date || entry.entry_date,
    sleep: toNumber(entry.sleep, 5),
    soreness: toNumber(entry.soreness, 5),
    stress: toNumber(entry.stress, 5),
    mood: toNumber(entry.mood, 5),
    motivation: toNumber(entry.motivation, 5),
    pain: toNumber(entry.pain, 1),
    notes: entry.notes || '',
    readinessScore: toNumber(entry.readinessScore ?? entry.readiness_score, null),
    createdAt: entry.createdAt || entry.created_at || new Date().toISOString()
  }
}

export const useReadinessStore = defineStore('readiness', () => {
  const entries = ref([])
  const loading = ref(false)

  function calculateReadinessScore(values) {
    const positive = (values.sleep || 0) + (values.mood || 0) + (values.motivation || 0)
    const negative = (values.soreness || 0) + (values.stress || 0) + (values.pain || 0)
    const raw = Math.round(((positive - negative) + 30) / 6)
    return clamp(raw, 1, 10)
  }

  async function loadEntries() {
    loading.value = true
    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          const data = await db.getReadinessEntries()
          entries.value = (data || []).map(normalizeEntry)
          persistLocal()
          return
        }
      }

      const stored = localStorage.getItem(STORAGE_KEY)
      entries.value = stored ? JSON.parse(stored).map(normalizeEntry) : []
    } catch (error) {
      console.error('Failed to load readiness entries:', error)
    } finally {
      loading.value = false
    }
  }

  function persistLocal() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.value))
  }

  async function saveEntry(entry) {
    const normalized = normalizeEntry({
      ...entry,
      readinessScore: calculateReadinessScore(entry)
    })

    const existingIndex = entries.value.findIndex(e => e.date === normalized.date)
    if (existingIndex >= 0) {
      entries.value[existingIndex] = { ...entries.value[existingIndex], ...normalized }
    } else {
      entries.value.unshift(normalized)
    }

    persistLocal()

    try {
      const { db, user, getUser, isConfigured } = useSupabase()
      if (isConfigured.value) {
        const currentUser = user.value || await getUser()
        if (currentUser) {
          await db.saveReadinessEntry(normalized)
        }
      }
    } catch (error) {
      console.warn('Failed to save readiness to Supabase:', error)
    }

    return normalized
  }

  function getEntryByDate(date) {
    const dateStr = typeof date === 'string' ? date : format(date, 'yyyy-MM-dd')
    return entries.value.find(e => e.date === dateStr)
  }

  const latestEntry = computed(() => {
    return entries.value
      .map(e => ({ ...e, dateObj: parseISO(e.date) }))
      .sort((a, b) => b.dateObj - a.dateObj)[0] || null
  })

  const recentAverage = computed(() => {
    if (entries.value.length === 0) return null
    const cutoff = subDays(new Date(), 6)
    const recent = entries.value.filter(e => parseISO(e.date) >= cutoff)
    if (!recent.length) return null
    const sum = recent.reduce((acc, e) => acc + (e.readinessScore || 0), 0)
    return Math.round((sum / recent.length) * 10) / 10
  })

  return {
    entries,
    loading,
    loadEntries,
    saveEntry,
    getEntryByDate,
    calculateReadinessScore,
    latestEntry,
    recentAverage
  }
})
