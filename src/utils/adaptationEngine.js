import { addDays, format, startOfDay, subDays } from 'date-fns'
import { parseDurationToMinutes, formatMinutesToDuration } from '@/utils/duration'

function sortByDate(a, b) {
  return (a.date || 0) - (b.date || 0)
}

function getPlannedDuration(workout) {
  return workout.PlannedDuration || workout['Planned Duration'] || ''
}

function getSessionType(workout) {
  return workout.SessionType || workout['Session Type'] || ''
}

function getTargetHrZone(workout) {
  return workout.TargetHRZone || workout['Target HR/Zone'] || ''
}

function getDetails(workout) {
  return workout.Details || ''
}

function getFocus(workout) {
  return workout.Focus || ''
}

function getWorkoutDescription(workout) {
  return workout.WorkoutDescription || workout['Workout Description'] || ''
}

function withinWindow(date, start, end) {
  if (!date) return false
  return date >= start && date <= end
}

function buildChangePayload(workout, overrides) {
  const from = {
    date: workout.date ? format(workout.date, 'yyyy-MM-dd') : null,
    sessionType: getSessionType(workout),
    plannedDuration: getPlannedDuration(workout),
    targetHrZone: getTargetHrZone(workout),
    details: getDetails(workout),
    focus: getFocus(workout)
  }

  const to = {
    date: overrides.customDate || from.date,
    sessionType: overrides.customSessionType || from.sessionType,
    plannedDuration: overrides.customPlannedDuration || from.plannedDuration,
    targetHrZone: overrides.customTargetHrZone || from.targetHrZone,
    details: overrides.customDetails || from.details,
    focus: overrides.customFocus || from.focus
  }

  return { from, to }
}

export function generateAdaptationProposal({
  workouts,
  logs,
  readinessEntries,
  windowDays,
  getWorkoutType,
  isRaceSpecific
}) {
  const today = startOfDay(new Date())
  const windowEnd = addDays(today, windowDays)

  const upcomingWorkouts = workouts
    .filter(workout => withinWindow(workout.date, today, windowEnd))
    .sort(sortByDate)

  const completedSet = new Set(logs.map(log => log.workoutId))

  // Recent logs sorted by date descending
  const recentLogs = logs
    .filter(log => new Date(log.completedAt) >= subDays(today, 14))
    .sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt))

  // Signal 1: Average RPE from last 3 logs
  const last3Logs = recentLogs.slice(0, 3).filter(l => l.rpe != null)
  const avgRpe = last3Logs.length >= 2
    ? last3Logs.reduce((sum, l) => sum + l.rpe, 0) / last3Logs.length
    : null

  // Signal 2: Latest leg feel score from readiness entries
  const sortedReadiness = [...readinessEntries]
    .sort((a, b) => b.date.localeCompare(a.date))
  const recentLegFeel = sortedReadiness.length > 0
    ? (sortedReadiness[0].readinessScore || null)
    : null

  // Check for consecutive tired days (value 4 = Tired)
  let consecutiveTiredDays = 0
  for (const entry of sortedReadiness) {
    if (entry.readinessScore === 4) {
      consecutiveTiredDays++
    } else {
      break
    }
  }

  // Signal 3: Pain from logs and readiness
  const recentPainLogs = Math.max(0, ...recentLogs.slice(0, 5).map(log => log.pain || 0))
  const recentPainReadiness = sortedReadiness.length > 0
    ? (sortedReadiness[0].pain || 0)
    : 0
  const recentPain = Math.max(recentPainLogs, recentPainReadiness)

  // Signal 4: Load spike (current week vs prior week)
  const weekLogs = logs.filter(log => new Date(log.completedAt) >= subDays(today, 6))
  const recentLoad = weekLogs.reduce((sum, log) => sum + (log.trainingLoad || log.actualDuration || 0), 0)
  const priorLogs = logs.filter(log => {
    const completedAt = new Date(log.completedAt)
    return completedAt >= subDays(today, 13) && completedAt < subDays(today, 6)
  })
  const priorLoad = priorLogs.reduce((sum, log) => sum + (log.trainingLoad || log.actualDuration || 0), 0)
  const loadSpike = priorLoad > 0 ? recentLoad / priorLoad : null

  // Signal 5: Missed key workouts
  const missedKeyWorkouts = workouts.filter(workout => {
    if (!workout.date || workout.date >= today) return false
    if (completedSet.has(workout.id)) return false
    const type = getWorkoutType(getSessionType(workout))
    return ['tempo', 'intervals', 'long', 'race'].includes(type)
  })

  const changes = []
  const changedWorkouts = new Set()
  let preservedRaceSpecific = 0

  const applyOverrideChange = (workout, override, reasonCode, reasonText) => {
    if (!workout || changedWorkouts.has(workout.id)) return
    const payload = buildChangePayload(workout, override)
    changes.push({
      id: `change-${workout.id}-${Date.now()}`,
      workoutId: workout.id,
      changeType: 'override',
      from: payload.from,
      to: payload.to,
      reasonCode,
      reasonText,
      override
    })
    changedWorkouts.add(workout.id)
  }

  const reduceDuration = (duration, percent) => {
    const minutes = parseDurationToMinutes(duration)
    if (!minutes) return null
    return formatMinutesToDuration(Math.max(15, minutes * (1 - percent)))
  }

  const isVeryHighRpe = avgRpe !== null && avgRpe >= 8.5
  const isHighRpe = avgRpe !== null && avgRpe >= 7.5
  const isWrecked = recentLegFeel !== null && recentLegFeel <= 2
  const isTiredStreak = consecutiveTiredDays >= 3
  const isHighPain = recentPain >= 7
  const hasLoadSpike = loadSpike !== null && loadSpike >= 1.3

  // Rule 1: Very high RPE (≥8.5) → convert next hard session to easy
  if (isVeryHighRpe) {
    const nextHard = upcomingWorkouts.find(workout => {
      if (changedWorkouts.has(workout.id)) return false
      if (isRaceSpecific(workout)) {
        preservedRaceSpecific += 1
        return false
      }
      const type = getWorkoutType(getSessionType(workout))
      return ['tempo', 'intervals', 'long'].includes(type)
    })

    if (nextHard) {
      const reducedDuration = reduceDuration(getPlannedDuration(nextHard), 0.3) || getPlannedDuration(nextHard)
      applyOverrideChange(
        nextHard,
        {
          workoutId: nextHard.id,
          customSessionType: 'Easy / Recovery Run',
          customTargetHrZone: 'Z1-Z2',
          customPlannedDuration: reducedDuration,
          customDetails: 'Converted to easy: RPE has been very high (≥8.5). Time to recover.',
          source: 'adaptation'
        },
        'VERY_HIGH_RPE',
        'Very high RPE detected (≥8.5 avg). Converting next hard session to easy recovery.'
      )
    }
  }
  // Rule 2: High RPE (≥7.5) → reduce next hard session
  else if (isHighRpe) {
    const nextHard = upcomingWorkouts.find(workout => {
      if (changedWorkouts.has(workout.id)) return false
      if (isRaceSpecific(workout)) {
        preservedRaceSpecific += 1
        return false
      }
      const type = getWorkoutType(getSessionType(workout))
      return ['tempo', 'intervals', 'long'].includes(type)
    })

    if (nextHard) {
      const reducedDuration = reduceDuration(getPlannedDuration(nextHard), 0.2) || getPlannedDuration(nextHard)
      applyOverrideChange(
        nextHard,
        {
          workoutId: nextHard.id,
          customSessionType: 'Controlled Aerobic Run',
          customTargetHrZone: 'Z2-Z3',
          customPlannedDuration: reducedDuration,
          customDetails: 'Adapted from high RPE: keep effort controlled and smooth.',
          source: 'adaptation'
        },
        'HIGH_RPE',
        'Recent RPE has been high (≥7.5 avg). Reducing intensity on next hard session.'
      )
    }
  }

  // Rule 3: Leg feel Wrecked or high pain → reduce next 2 sessions
  if (isWrecked || isHighPain) {
    let applied = 0
    for (const workout of upcomingWorkouts) {
      if (applied >= 2) break
      if (changedWorkouts.has(workout.id)) continue
      const type = getWorkoutType(getSessionType(workout))
      const raceSpecific = isRaceSpecific(workout)
      if (raceSpecific && !isHighPain) {
        preservedRaceSpecific += 1
        continue
      }

      let customSessionType = getSessionType(workout)
      let customTargetHrZone = getTargetHrZone(workout)
      let customPlannedDuration = getPlannedDuration(workout)
      let customDetails = getDetails(workout)

      if (['tempo', 'intervals', 'long', 'race'].includes(type)) {
        customSessionType = 'Easy / Recovery Run'
        customTargetHrZone = 'Z1-Z2'
        customPlannedDuration = reduceDuration(customPlannedDuration, 0.3) || customPlannedDuration
        customDetails = 'Adapted for recovery: keep it easy and smooth.'
      } else {
        customPlannedDuration = reduceDuration(customPlannedDuration, 0.15) || customPlannedDuration
        customDetails = 'Adapted for recovery: reduce duration.'
      }

      applyOverrideChange(
        workout,
        {
          workoutId: workout.id,
          customSessionType,
          customTargetHrZone,
          customPlannedDuration,
          customDetails,
          source: 'adaptation'
        },
        isHighPain ? 'HIGH_PAIN' : 'WRECKED',
        isHighPain
          ? 'High pain or discomfort detected. Reducing intensity to protect recovery.'
          : 'Legs feeling wrecked. Reducing next 2 sessions for recovery.'
      )
      applied += 1
    }
  }

  // Rule 4: Tired for 3+ consecutive days → suggest recovery day
  if (isTiredStreak && !isWrecked) {
    const nextHard = upcomingWorkouts.find(workout => {
      if (changedWorkouts.has(workout.id)) return false
      if (isRaceSpecific(workout)) return false
      const type = getWorkoutType(getSessionType(workout))
      return ['tempo', 'intervals', 'long'].includes(type)
    })

    if (nextHard) {
      applyOverrideChange(
        nextHard,
        {
          workoutId: nextHard.id,
          customSessionType: 'Easy / Recovery Run',
          customTargetHrZone: 'Z1-Z2',
          customPlannedDuration: reduceDuration(getPlannedDuration(nextHard), 0.3) || getPlannedDuration(nextHard),
          customDetails: 'Legs have felt tired for 3+ days. Taking it easy to recharge.',
          source: 'adaptation'
        },
        'TIRED_STREAK',
        'Legs have felt tired for 3+ consecutive days. Converting hard session to recovery.'
      )
    }
  }

  // Rule 5: Load spike ≥1.3 → reduce longest session by 20%
  if (hasLoadSpike) {
    const longest = upcomingWorkouts
      .filter(workout => !changedWorkouts.has(workout.id))
      .filter(workout => !isRaceSpecific(workout))
      .map(workout => ({
        workout,
        minutes: parseDurationToMinutes(getPlannedDuration(workout)) || 0
      }))
      .sort((a, b) => b.minutes - a.minutes)[0]

    if (longest && longest.minutes > 0) {
      const reducedDuration = formatMinutesToDuration(longest.minutes * 0.8)
      applyOverrideChange(
        longest.workout,
        {
          workoutId: longest.workout.id,
          customPlannedDuration: reducedDuration,
          customDetails: 'Adapted due to recent load spike: reduce volume to stabilize load.',
          source: 'adaptation'
        },
        'LOAD_SPIKE',
        'Recent training load increased sharply (≥1.3x). Reducing longest session to prevent overload.'
      )
    }
  }

  // Rule 6: Missed key session → convert next easy session to make-up
  if (missedKeyWorkouts.length > 0 && !isHighPain && !isWrecked) {
    const missed = missedKeyWorkouts[missedKeyWorkouts.length - 1]
    const makeUp = upcomingWorkouts.find(workout => {
      if (changedWorkouts.has(workout.id)) return false
      if (isRaceSpecific(workout)) return false
      const type = getWorkoutType(getSessionType(workout))
      return ['easy', 'recovery', 'rest'].includes(type)
    })

    if (makeUp) {
      applyOverrideChange(
        makeUp,
        {
          workoutId: makeUp.id,
          customSessionType: getSessionType(missed),
          customTargetHrZone: getTargetHrZone(missed),
          customPlannedDuration: getPlannedDuration(missed),
          customDetails: `Make-up key session (missed ${format(missed.date, 'MMM d')}).`,
          customFocus: getFocus(missed),
          customWorkoutDescription: getWorkoutDescription(missed),
          source: 'adaptation'
        },
        'MISSED_KEY',
        'A key session was missed. Converting the next easy day into a make-up workout.'
      )
    }
  }

  const summaryParts = []
  if (changes.length === 0) {
    summaryParts.push('No adaptations needed. Training load and readiness look stable.')
  } else {
    if (isVeryHighRpe) summaryParts.push('Very high RPE — converted hard session to easy.')
    else if (isHighRpe) summaryParts.push('High RPE trend reduced intensity on hard sessions.')
    if (isWrecked) summaryParts.push('Legs feeling wrecked — reducing next sessions.')
    if (isHighPain) summaryParts.push('High pain reported, prioritizing recovery.')
    if (isTiredStreak && !isWrecked) summaryParts.push('Tired streak detected — added recovery day.')
    if (hasLoadSpike) summaryParts.push('Load spike detected; reduced volume to stabilize.')
    if (missedKeyWorkouts.length > 0 && !isHighPain && !isWrecked) summaryParts.push('Missed key session was rescheduled into an easy day.')
  }
  if (preservedRaceSpecific > 0) {
    summaryParts.push(`${preservedRaceSpecific} race-specific sessions were preserved.`)
  }

  return {
    changes,
    summary: summaryParts.join(' '),
    signals: {
      avgRpe: avgRpe ? Math.round(avgRpe * 10) / 10 : null,
      recentLegFeel,
      recentPain,
      loadSpike: loadSpike ? Math.round(loadSpike * 100) : null,
      missedKeyCount: missedKeyWorkouts.length
    }
  }
}
