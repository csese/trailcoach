import { differenceInWeeks, addWeeks, format, subDays, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns'
import { calculateLoadMetrics } from '@/utils/loadCalculator'
import trainingPlan from '@/data/trainingPlan.json'

function parseWorkoutDateFromPlan(datesStr, day) {
  if (!datesStr || !day) return null
  const dayMap = { 'Mon': 0, 'Tue': 1, 'Wed': 2, 'Thu': 3, 'Fri': 4, 'Sat': 5, 'Sun': 6 }
  const monthMap = { 'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5, 'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11 }
  try {
    const parts = datesStr.trim().split(' ')
    const month = monthMap[parts[0]]
    if (month === undefined) return null
    const startDay = parseInt(parts[1].split('-')[0])
    const weekStart = new Date(2026, month, startDay)
    const dayKey = day.slice(0, 3)
    const dayOffset = dayMap[dayKey] ?? 0
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + dayOffset)
    return d
  } catch { return null }
}

function getCurrentWeekFromPlan(today) {
  for (const w of trainingPlan) {
    if (!w.Dates) continue
    const monDate = parseWorkoutDateFromPlan(w.Dates, 'Mon')
    if (!monDate) continue
    const sunDate = new Date(monDate)
    sunDate.setDate(monDate.getDate() + 6)
    if (today >= monDate && today <= sunDate) {
      return parseInt(w.Week) || 1
    }
  }
  return 1
}

const LEG_FEEL_MAP = {
  '💀': 1, '😴': 2, '👍': 3, '💪': 4
}

function parseLegFeel(val) {
  if (val == null) return null
  if (typeof val === 'number') return val
  return LEG_FEEL_MAP[val] ?? null
}

export function buildCoachContext({ workoutsStore, logsStore, adaptationsStore, stravaTokens }) {
  const today = new Date()
  const currentWeek = getCurrentWeekFromPlan(today)
  const goalRaceDate = new Date('2026-09-27')
  const weeksToGoalRace = Math.max(0, differenceInWeeks(goalRaceDate, today))

  const races = [
    { name: 'Balcons du Léman 68K', date: '2026-06-14', role: 'intermediate' },
    { name: 'Gypaète 76K', date: '2026-08-22', role: 'intermediate' },
    { name: 'Nice 110K', date: '2026-09-27', role: 'goal' }
  ].map(r => ({
    ...r,
    weeksAway: Math.max(0, differenceInWeeks(new Date(r.date), today))
  }))

  // Recent history — last 4 weeks
  const fourWeeksAgo = subDays(today, 28)
  const allWorkouts = workoutsStore.workouts || []
  const allLogs = logsStore.logs || []

  const recentWorkouts = allWorkouts.filter(w => w.date && w.date >= fourWeeksAgo && w.date <= today)
  const loggedWorkoutIds = new Set(allLogs.map(l => l.workoutId))
  const recentCompleted = recentWorkouts.filter(w => loggedWorkoutIds.has(w.id))

  // Build a map of workoutId -> workout date for proper time filtering
  const workoutDateMap = {}
  allWorkouts.forEach(w => {
    if (w.date) workoutDateMap[w.id] = w.date
  })

  // Use workout date (not completedAt) for time filtering — fixes bulk-logged sessions
  const recentLogs = allLogs.filter(l => {
    const workoutDate = workoutDateMap[l.workoutId]
    if (workoutDate) {
      return workoutDate >= fourWeeksAgo && workoutDate <= today
    }
    // Fallback to completedAt if no workout date found
    const d = l.completedAt ? new Date(l.completedAt) : null
    return d && d >= fourWeeksAgo && d <= today
  })

  const totalPlanned = recentWorkouts.length
  const totalCompleted = recentCompleted.length
  const completionRate = totalPlanned > 0 ? totalCompleted / totalPlanned : 0

  const rpeValues = recentLogs.map(l => l.rpe).filter(v => v != null)
  const avgRpe = rpeValues.length > 0 ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null

  // Missed session types
  const missedIds = new Set(recentWorkouts.filter(w => !loggedWorkoutIds.has(w.id)).map(w => w.id))
  const missedSessionTypes = [...new Set(
    recentWorkouts.filter(w => missedIds.has(w.id)).map(w => w.SessionType)
  )]

  // Leg feel trend from readiness — use feltVsPlanned from logs as proxy
  const legFeelTrend = computeLegFeelTrend(recentLogs, workoutDateMap)

  // Load metrics
  const activityHistory = allLogs
    .filter(l => l.completedAt && (l.rpe != null || l.actualDuration != null))
    .map(l => ({
      date: l.completedAt.slice(0, 10),
      load: (l.trainingLoad || l.relativeEffort || ((l.rpe || 5) * (l.actualDuration || 60) / 60))
    }))
  const loadMetrics = activityHistory.length > 0 ? calculateLoadMetrics(activityHistory) : null

  // Current week sessions
  const weekStart = startOfWeek(today, { weekStartsOn: 1 })
  const weekEnd = endOfWeek(today, { weekStartsOn: 1 })
  const currentWeekSessions = allWorkouts
    .filter(w => w.date && isWithinInterval(w.date, { start: weekStart, end: weekEnd }))
    .map(w => ({
      id: w.id,
      day: w.Day,
      date: w.date ? format(w.date, 'yyyy-MM-dd') : null,
      sessionType: w.SessionType,
      plannedDuration: w.PlannedDuration,
      focus: w.Focus,
      details: w.Details,
      completed: loggedWorkoutIds.has(w.id)
    }))

  // Upcoming 3 weeks
  const upcomingStart = addWeeks(weekStart, 1)
  const upcomingEnd = addWeeks(weekStart, 9)
  const upcomingPlan = allWorkouts
    .filter(w => w.date && w.date >= upcomingStart && w.date < upcomingEnd)
    .map(w => ({
      week: w.Week,
      day: w.Day,
      date: w.date ? format(w.date, 'yyyy-MM-dd') : null,
      sessionType: w.SessionType,
      plannedDuration: w.PlannedDuration,
      focus: w.Focus,
      details: w.Details
    }))

  // Full plan phase summary — tells coach about the entire 38-week structure
  const planPhaseSummary = (() => {
    const phases = {}
    trainingPlan.forEach(w => {
      const phase = w.Phase || w.phase || 'Unknown'
      if (!phases[phase]) phases[phase] = { phase, weeks: [], sessionCount: 0 }
      if (!phases[phase].weeks.includes(w.Week)) phases[phase].weeks.push(w.Week)
      phases[phase].sessionCount++
    })
    return Object.values(phases).map(p => ({
      phase: p.phase,
      weekRange: `W${Math.min(...p.weeks.map(Number))}-W${Math.max(...p.weeks.map(Number))}`,
      sessionCount: p.sessionCount
    }))
  })()

  // Last 4 weeks completed workout summary
  const completedSummary = recentCompleted.map(w => {
    const log = allLogs.find(l => l.workoutId === w.id)
    return {
      date: w.date ? format(w.date, 'yyyy-MM-dd') : null,
      sessionType: w.SessionType,
      plannedDuration: w.PlannedDuration,
      focus: w.Focus,
      log: log ? {
        rpe: log.rpe,
        actualDuration: log.actualDuration,
        feltVsPlanned: log.feltVsPlanned,
        notes: log.notes
      } : null
    }
  })

  // Active adaptations
  const activeAdaptations = adaptationsStore.pendingProposal
    ? [adaptationsStore.pendingProposal]
    : []

  return {
    athlete: {
      name: 'Charles',
      goalRace: { name: 'Nice 110K', date: '2026-09-27', target: 'sub-18h', distanceKm: 110, elevationM: 5800 },
      currentWeek,
      currentPhase: workoutsStore.currentPhase?.name || 'Unknown',
      weeksToGoalRace,
      planTotalWeeks: 38
    },
    races,
    recentHistory: {
      completionRate,
      avgRpe,
      legFeelTrend,
      missedSessionTypes,
      totalPlanned,
      totalCompleted
    },
    loadMetrics,
    currentWeekSessions,
    upcomingPlan,
    activeAdaptations,
    planPhaseSummary,
    completedSummary,
    stravaConnected: !!stravaTokens
  }
}

function computeLegFeelTrend(recentLogs, workoutDateMap = {}) {
  const now = new Date()
  const twoWeeksAgo = subDays(now, 14)
  const fourWeeksAgo = subDays(now, 28)

  function getLogDate(l) {
    const workoutDate = workoutDateMap[l.workoutId]
    if (workoutDate) return workoutDate
    return l.completedAt ? new Date(l.completedAt) : null
  }

  const recent = recentLogs.filter(l => {
    const d = getLogDate(l)
    return d && d >= twoWeeksAgo && d <= now
  })
  const prior = recentLogs.filter(l => {
    const d = getLogDate(l)
    return d && d >= fourWeeksAgo && d < twoWeeksAgo
  })

  const avgFeel = (logs) => {
    // Use feltVsPlanned as proxy: easier_than_planned=4, as_planned=3, harder_than_planned=2, could_not_finish=1
    const map = { easier_than_planned: 4, as_planned: 3, harder_than_planned: 2, could_not_finish: 1 }
    const vals = logs.map(l => map[l.feltVsPlanned] || 3).filter(v => v != null)
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null
  }

  const recentAvg = avgFeel(recent)
  const priorAvg = avgFeel(prior)

  if (recentAvg == null || priorAvg == null) return 'stable'
  if (recentAvg - priorAvg > 0.3) return 'improving'
  if (priorAvg - recentAvg > 0.3) return 'declining'
  return 'stable'
}
