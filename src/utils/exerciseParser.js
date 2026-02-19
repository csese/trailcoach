import exercises from '@/data/exercises.json'

// Build lookup maps for fuzzy matching
const exercisesByName = new Map()
const aliasMap = new Map()

// Aliases for fuzzy matching
const aliases = {
  'back-squat': ['back squat', 'back squats', 'squats', 'squat'],
  'bulgarian-split-squat': ['bulgarian split squat', 'bulgarian split squats'],
  'walking-lunge': ['walking lunges', 'walking lunge', 'lunges', 'lunge'],
  'box-step-up': ['box step-ups', 'box step-up', 'step-ups', 'step-up', 'step ups', 'step up'],
  'calf-raise': ['calf raises', 'calf raise'],
  'single-leg-calf-raise': ['single-leg calf raises', 'single-leg calf raise', 'single leg calf raises'],
  'plank': ['plank', 'planks'],
  'dead-bug': ['dead bugs', 'dead bug'],
  'side-plank': ['side plank', 'side planks'],
  'push-up': ['push-ups', 'push-up', 'push ups', 'pushups'],
  'row': ['rows', 'row'],
  'shoulder-press': ['shoulder press'],
  'russian-twist': ['russian twists', 'russian twist'],
  'romanian-deadlift': ['romanian deadlifts', 'romanian deadlift', 'deadlifts', 'deadlift'],
  'hip-thrust': ['hip thrust', 'hip thrusts'],
  'glute-bridge': ['glute bridge', 'glute bridges'],
  'nordic-hamstring-curl': ['nordic hamstring curl', 'nordic hamstring curls', 'nordic curls', 'nordic curl'],
  'box-jump': ['box jumps', 'box jump'],
  'broad-jump': ['broad jumps', 'broad jump'],
  'single-leg-squat': ['single leg squat', 'single leg squats', 'single-leg squat', 'single-leg squats'],
  'hip-flexor-stretch': ['hip flexor stretch', 'hip flexors'],
  'hamstring-stretch': ['hamstring stretch', 'hamstrings'],
  'single-leg-deadlift': ['single leg deadlift', 'single leg deadlifts', 'single-leg deadlifts'],
  'step-down': ['step-downs', 'step downs', 'step-down'],
  'pigeon-pose': ['pigeon pose'],
  'ninety-ninety-stretch': ['90/90 stretch']
}

// Build maps
exercises.forEach(ex => {
  exercisesByName.set(ex.name.toLowerCase(), ex)
})

Object.entries(aliases).forEach(([id, names]) => {
  names.forEach(name => aliasMap.set(name.toLowerCase(), id))
})

function findExercise(name) {
  const lower = name.toLowerCase().trim()

  // Direct alias match
  const aliasId = aliasMap.get(lower)
  if (aliasId) return exercises.find(e => e.id === aliasId)

  // Partial match
  for (const [alias, id] of aliasMap.entries()) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return exercises.find(e => e.id === id)
    }
  }

  return null
}

/**
 * Parse a single exercise item string into a structured object.
 * Handles formats like:
 *   "A1. Back Squat — 4x10 @ 70% — Rest 90s"
 *   "Leg swings x20"
 *   "Plank 45s"
 *   "Dead Bugs 12 reps"
 */
function parseOneExercise(raw, section) {
  let text = raw.trim()
  if (!text) return null

  // Strip leading label like "A1." "B2." etc
  text = text.replace(/^[A-Z]\d+\.\s*/, '')

  // Strip trailing "Rest Xs" or "— Rest Xs"
  text = text.replace(/\s*—?\s*Rest\s+\d+s?\s*$/i, '')

  // Try to extract sets×reps pattern: 4x10, 3×12
  const setsRepsMatch = text.match(/(\d+)\s*[x×]\s*(\d+)/)
  let sets = null
  let reps = null
  let notes = null
  let exerciseName = text

  if (setsRepsMatch) {
    sets = setsRepsMatch[1]
    reps = setsRepsMatch[2]
    // Name is everything before the sets×reps, or between "— " segments
    // Split by em-dash segments
    const dashParts = text.split(/\s*—\s*/)
    if (dashParts.length >= 2) {
      // "Back Squat" — "4x10 @ 70%" — "Rest 90s"
      exerciseName = dashParts[0].trim()
      // Notes: anything after sets×reps in the second part
      const afterSetsReps = dashParts[1].replace(/\d+\s*[x×]\s*\d+\s*/, '').trim()
      if (afterSetsReps) {
        // Combine with any modifiers like "each leg"
        notes = afterSetsReps
      }
      // Check remaining dash parts for notes (skip "Rest" ones)
      for (let i = 2; i < dashParts.length; i++) {
        if (!/^Rest\s/i.test(dashParts[i].trim())) {
          notes = (notes ? notes + ' ' : '') + dashParts[i].trim()
        }
      }
    } else {
      // No em-dashes: "3x12 walking lunges" or "Walking Lunges 3x12 each leg"
      // Try name before setsxreps
      const beforeMatch = text.substring(0, setsRepsMatch.index).trim()
      const afterMatch = text.substring(setsRepsMatch.index + setsRepsMatch[0].length).trim()
      if (beforeMatch) {
        exerciseName = beforeMatch
        if (afterMatch) notes = afterMatch
      } else {
        // setsxreps at start: "3x12 walking lunges"
        exerciseName = afterMatch
      }
    }
  } else {
    // No sets×reps — try "x20", "45s", "12 reps" patterns
    const xRepsMatch = text.match(/[x×](\d+)/)
    const timeMatch = text.match(/(\d+)s\b/)
    const numRepsMatch = text.match(/(\d+)\s*reps?/)

    if (xRepsMatch) {
      reps = xRepsMatch[1]
      exerciseName = text.substring(0, xRepsMatch.index).trim()
      const after = text.substring(xRepsMatch.index + xRepsMatch[0].length).trim()
      if (after) notes = after
    } else if (numRepsMatch) {
      reps = numRepsMatch[1]
      exerciseName = text.substring(0, numRepsMatch.index).trim()
      const after = text.substring(numRepsMatch.index + numRepsMatch[0].length).trim()
      if (after) notes = after
    } else if (timeMatch) {
      reps = timeMatch[1] + 's'
      exerciseName = text.substring(0, timeMatch.index).trim()
      const after = text.substring(timeMatch.index + timeMatch[0].length).trim()
      if (after) notes = after
    }
  }

  // Clean up exercise name: strip parenthetical modifiers for matching
  const cleanName = exerciseName
    .replace(/\s*\(.*?\)/g, '')
    .replace(/\s*—\s*$/, '')
    .trim()

  if (!cleanName) return null

  const exercise = findExercise(cleanName)

  return {
    sets,
    reps,
    exerciseName: cleanName.charAt(0).toUpperCase() + cleanName.slice(1),
    exerciseId: exercise?.id || null,
    notes: notes || null,
    section,
    rawText: raw.trim()
  }
}

/**
 * Detect which section a line belongs to based on header keywords.
 * Returns { section, isHeader } or null.
 */
function detectSection(line) {
  const l = line.trim()
  if (/^Ultra Goal/i.test(l)) return { section: null, isHeader: true }
  if (/^WARM-?UP/i.test(l)) return { section: 'warmup', isHeader: true }
  if (/^MAIN BLOCK/i.test(l)) return { section: 'main', isHeader: true }
  if (/^CORE CIRCUIT/i.test(l)) return { section: 'core', isHeader: true }
  if (/^COOL-?DOWN/i.test(l)) return { section: 'cooldown', isHeader: true }
  return null
}

/**
 * Parse a workout description string into structured exercise objects.
 */
export function parseExercises(workoutDescription) {
  if (!workoutDescription) return []

  // Normalize: replace literal \n with actual newlines
  let desc = workoutDescription.replace(/\\n/g, '\n')

  const lines = desc.split('\n')
  const results = []
  let currentSection = 'main'

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    // Check if this line is a section header
    const sectionInfo = detectSection(trimmed)
    if (sectionInfo) {
      if (sectionInfo.section) currentSection = sectionInfo.section

      // Some headers contain inline exercises: "WARM-UP (5 min): Leg swings x20, ..."
      const colonIdx = trimmed.indexOf(':')
      if (colonIdx !== -1) {
        const afterColon = trimmed.substring(colonIdx + 1).trim()
        if (afterColon && !/^$/.test(afterColon)) {
          // Check for section modifiers like "(x3, 45s rest between rounds)"
          if (/^\(?\s*x\d+/i.test(afterColon) || /^\d+s rest/i.test(afterColon)) continue

          // Could be pipe-separated (core) or comma-separated (warmup/cooldown)
          if (afterColon.includes('|')) {
            afterColon.split('|').forEach(item => {
              const parsed = parseOneExercise(item, sectionInfo.section || currentSection)
              if (parsed) results.push(parsed)
            })
          } else {
            afterColon.split(',').forEach(item => {
              const parsed = parseOneExercise(item, sectionInfo.section || currentSection)
              if (parsed) results.push(parsed)
            })
          }
        }
      }
      continue
    }

    // Skip pure modifier lines like "(x3, 45s rest between rounds)"
    if (/^\(?\s*x\d+/i.test(trimmed)) continue
    if (/^\d+s\s+rest/i.test(trimmed)) continue

    // Pipe-separated (core circuit items)
    if (trimmed.includes('|')) {
      trimmed.split('|').forEach(item => {
        const parsed = parseOneExercise(item, currentSection)
        if (parsed) results.push(parsed)
      })
      continue
    }

    // Labeled exercise line: "A1. Back Squat — 4x10 ..."
    if (/^[A-Z]\d+\.\s/.test(trimmed)) {
      const parsed = parseOneExercise(trimmed, currentSection)
      if (parsed) results.push(parsed)
      continue
    }

    // Comma-separated items (warmup/cooldown style)
    if (trimmed.includes(',') && (currentSection === 'warmup' || currentSection === 'cooldown')) {
      trimmed.split(',').forEach(item => {
        const parsed = parseOneExercise(item, currentSection)
        if (parsed) results.push(parsed)
      })
      continue
    }

    // Fallback: try to parse as a single exercise
    const parsed = parseOneExercise(trimmed, currentSection)
    if (parsed) results.push(parsed)
  }

  return results
}

/**
 * Get exercise details by ID
 */
export function getExerciseById(id) {
  return exercises.find(e => e.id === id) || null
}
