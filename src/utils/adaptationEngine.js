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

function getRecentEntries(entries, days) {
  const cutoff = subDays(new Date(), days - 1)
  return entries.filter(entry => {
    const entryDate = new Date(entry.date)
    return entryDate >= cutoff
  })
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

  const recentReadiness = getRecentEntries(readinessEntries, 3)
  const readinessAvg = recentReadiness.length
    ? recentReadiness.reduce((sum, entry) => sum + (entry.readinessScore || 0), 0) / recentReadiness.length
    : null

  const recentPainReadiness = Math.max(
    0,
    ...recentReadiness.map(entry => entry.pain || 0)
  )

  const recentLogs = logs.filter(log => new Date(log.completedAt) >= subDays(today, 6))
  const recentPainLogs = Math.max(0, ...recentLogs.map(log => log.pain || 0))
  const recentPain = Math.max(recentPainReadiness, recentPainLogs)
  const recentRpe = recentLogs.length
    ? recentLogs.reduce((sum, log) => sum + (log.rpe || 0), 0) / recentLogs.length
    : null

  const recentLoad = recentLogs.reduce((sum, log) => sum + (log.trainingLoad || log.actualDuration || 0), 0)
  const priorLogs = logs.filter(log => {
    const completedAt = new Date(log.completedAt)
    return completedAt >= subDays(today, 13) && completedAt < subDays(today, 6)
  })
  const priorLoad = priorLogs.reduce((sum, log) => sum + (log.trainingLoad || log.actualDuration || 0), 0)
  const loadSpike = priorLoad > 0 ? recentLoad / priorLoad : null

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

  const isLowReadiness = readinessAvg !== null && readinessAvg <= 4
  const isHighPain = recentPain >= 7
  const isHighRpe = recentRpe !== null && recentRpe >= 7
  const hasLoadSpike = loadSpike !== null && loadSpike >= 1.2

  // Rule 1: Low readiness or high pain => reduce next 2 sessions
  if (isLowReadiness || isHighPain) {
    let applied = 0
    for (const workout of upcomingWorkouts) {
      if (applied >= 2) break
      const type = getWorkoutType(getSessionType(workout))
      const raceSpecific = isRaceSpecific(workout)
      if (raceSpecific && !isHighPain) {
        preservedRaceSpecific += 1
        continue
      }
      if (raceSpecific && isHighPain && applied < 1) {
        // Apply to race-specific only if no other option for safety
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
        isHighPain ? 'HIGH_PAIN' : 'LOW_READINESS',
        isHighPain
          ? 'High pain or discomfort detected. Reducing intensity to protect recovery.'
          : 'Low readiness trend detected. Reducing intensity to support recovery.'
      )
      applied += 1
    }
  }

  // Rule 2: High RPE => reduce next hard session
  if (isHighRpe) {
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
        'Recent RPE has been high. Reducing intensity on the next hard session.'
      )
    }
  }

  // Rule 3: Load spike => reduce longest upcoming run
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
        'Recent training load increased sharply. Reducing longest session to prevent overload.'
      )
    }
  }

  // Rule 4: Missed key session => convert next easy session to make-up
  if (missedKeyWorkouts.length > 0 && !isHighPain) {
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
    if (isLowReadiness) summaryParts.push('Low readiness trend triggered recovery adjustments.')
    if (isHighPain) summaryParts.push('High pain reported, prioritizing recovery.')
    if (isHighRpe) summaryParts.push('High RPE trend reduced intensity on hard sessions.')
    if (hasLoadSpike) summaryParts.push('Load spike detected; reduced volume to stabilize.')
    if (missedKeyWorkouts.length > 0 && !isHighPain) summaryParts.push('Missed key session was rescheduled into an easy day.')
  }
  if (preservedRaceSpecific > 0) {
    summaryParts.push(`${preservedRaceSpecific} race-specific sessions were preserved.`)
  }

  return {
    changes,
    summary: summaryParts.join(' '),
    signals: {
      readinessAvg: readinessAvg ? Math.round(readinessAvg * 10) / 10 : null,
      recentPain,
      recentRpe: recentRpe ? Math.round(recentRpe * 10) / 10 : null,
      loadSpike: loadSpike ? Math.round(loadSpike * 100) : null
    }
  }
}
