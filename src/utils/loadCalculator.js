/**
 * ATL/CTL/TSB Load Calculator for ultra running training.
 *
 * ATL  – Acute Training Load   (7-day exponentially weighted)
 * CTL  – Chronic Training Load (42-day exponentially weighted)
 * TSB  – Training Stress Balance = CTL - ATL
 */

import { format, subDays, parseISO, differenceInCalendarDays } from 'date-fns'

/**
 * Fill an array of { date, load } into a contiguous daily map,
 * summing loads that fall on the same day and inserting 0 for rest days.
 */
function buildDailyLoads(activityHistory, numDays = 60) {
  const today = new Date()
  const loadByDate = {}

  for (const entry of activityHistory) {
    const d = typeof entry.date === 'string' ? entry.date : format(entry.date, 'yyyy-MM-dd')
    loadByDate[d] = (loadByDate[d] || 0) + (entry.load || 0)
  }

  const daily = []
  for (let i = numDays - 1; i >= 0; i--) {
    const d = format(subDays(today, i), 'yyyy-MM-dd')
    daily.push({ date: d, load: loadByDate[d] || 0 })
  }
  return daily
}

/**
 * Exponentially weighted moving average.
 * decay = 2 / (period + 1)
 */
function ewma(values, period) {
  const decay = 2 / (period + 1)
  let avg = values[0] || 0
  for (let i = 1; i < values.length; i++) {
    avg = values[i] * decay + avg * (1 - decay)
  }
  return avg
}

/**
 * Calculate ATL, CTL, TSB and trend from activity history.
 *
 * @param {Array<{date: string, load: number}>} activityHistory
 * @returns {{ atl: number, ctl: number, tsb: number, trend: string }}
 */
export function calculateLoadMetrics(activityHistory) {
  if (!activityHistory || activityHistory.length === 0) {
    return { atl: 0, ctl: 0, tsb: 0, trend: 'detraining' }
  }

  const daily = buildDailyLoads(activityHistory, 60)
  const loads = daily.map(d => d.load)

  const atl = Math.round(ewma(loads, 7) * 10) / 10
  const ctl = Math.round(ewma(loads, 42) * 10) / 10
  const tsb = Math.round((ctl - atl) * 10) / 10

  // Determine trend from recent ATL/CTL movement
  const recentLoads = loads.slice(-14)
  const olderLoads = loads.slice(-28, -14)
  const recentAvg = recentLoads.reduce((s, v) => s + v, 0) / (recentLoads.length || 1)
  const olderAvg = olderLoads.reduce((s, v) => s + v, 0) / (olderLoads.length || 1)

  let trend
  if (recentAvg < 5 && olderAvg < 5) {
    trend = 'detraining'
  } else if (tsb > 5 && recentAvg < olderAvg) {
    trend = 'peaking'
  } else if (tsb > 0) {
    trend = 'recovering'
  } else {
    trend = 'building'
  }

  return { atl, ctl, tsb, trend }
}

/**
 * Interpret TSB value for an ultra runner.
 */
export function interpretTSB(tsb) {
  if (tsb > 10) return { status: 'fresh', label: 'Fresh', description: 'Well rested — good for race week' }
  if (tsb >= 0) return { status: 'optimal', label: 'Optimal form', description: 'Race ready' }
  if (tsb >= -10) return { status: 'slightly fatigued', label: 'Slightly fatigued', description: 'Normal training fatigue' }
  if (tsb >= -20) return { status: 'moderately fatigued', label: 'Moderately fatigued', description: 'Be careful with hard sessions' }
  return { status: 'overreached', label: 'Overreached', description: 'Need recovery — back off training' }
}

/**
 * Compare planned vs actual weekly load.
 *
 * @param {number} planned - total planned load
 * @param {number} actual  - total actual load
 * @returns {{ ratio: number, status: string }}
 */
export function compareLoadVsPlan(planned, actual) {
  if (!planned || planned === 0) {
    return { ratio: actual > 0 ? 999 : 0, status: 'on-track' }
  }
  const ratio = Math.round((actual / planned) * 100) / 100
  let status
  if (ratio < 0.8) status = 'undertrained'
  else if (ratio > 1.2) status = 'overtrained'
  else status = 'on-track'
  return { ratio, status }
}
