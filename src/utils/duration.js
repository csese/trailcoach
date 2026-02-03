export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function parseDurationToMinutes(value) {
  if (!value) return null
  const raw = String(value).toLowerCase().trim()
  if (!raw) return null

  // Normalize separators
  const normalized = raw.replace(/\s+/g, '')

  // Handle ranges like "45-60min" or "1h-1h30"
  if (normalized.includes('-')) {
    const [start, end] = normalized.split('-')
    const startMinutes = parseDurationToMinutes(start)
    const endMinutes = parseDurationToMinutes(end)
    if (startMinutes && endMinutes) {
      return Math.round((startMinutes + endMinutes) / 2)
    }
    return startMinutes || endMinutes
  }

  // Handle formats like "1h30min", "1h30", "2h", "45min"
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)h/)
  const minuteMatch = normalized.match(/(\d+(?:\.\d+)?)m(?:in)?/)

  const hours = hourMatch ? parseFloat(hourMatch[1]) : 0
  const minutes = minuteMatch ? parseFloat(minuteMatch[1]) : 0

  if (hours || minutes) {
    return Math.round(hours * 60 + minutes)
  }

  // Handle pure minutes like "45"
  const numberOnly = normalized.match(/^\d+(?:\.\d+)?$/)
  if (numberOnly) {
    return Math.round(parseFloat(numberOnly[0]))
  }

  return null
}

export function formatMinutesToDuration(minutes) {
  if (minutes === null || minutes === undefined || Number.isNaN(minutes)) return ''
  const rounded = Math.max(0, Math.round(minutes))
  if (rounded < 60) return `${rounded}min`
  const hours = Math.floor(rounded / 60)
  const mins = rounded % 60
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}min`
}

export function formatPaceMinPerKm(speedMetersPerSecond) {
  if (!speedMetersPerSecond || speedMetersPerSecond <= 0) return null
  const secondsPerKm = 1000 / speedMetersPerSecond
  const minutes = Math.floor(secondsPerKm / 60)
  const seconds = Math.round(secondsPerKm % 60)
  return `${minutes}:${String(seconds).padStart(2, '0')}/km`
}
