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
  
  // Partial match - check if any alias is contained in the name or vice versa
  for (const [alias, id] of aliasMap.entries()) {
    if (lower.includes(alias) || alias.includes(lower)) {
      return exercises.find(e => e.id === id)
    }
  }
  
  return null
}

/**
 * Parse a workout description string into structured exercise objects.
 * @param {string} workoutDescription - e.g. "STRENGTH SESSION: 3x12 back squats, 3x10 walking lunges..."
 * @returns {Array<{sets: string, reps: string, exerciseName: string, exerciseId: string|null, rawText: string}>}
 */
export function parseExercises(workoutDescription) {
  if (!workoutDescription) return []
  
  // Strip the prefix (e.g. "STRENGTH SESSION:", "RECOVERY STRENGTH:", etc.)
  let desc = workoutDescription.replace(/^[A-Z\s\-]+:\s*/, '')
  
  // Remove trailing instructions like "Rest 60-90s between sets." or "Finish with..."
  desc = desc.replace(/\.\s*(Rest|Finish|Recovery|Don't|Keep|This|Focus).*$/i, '')
  desc = desc.replace(/,\s*(core circuit|extended mobility|mobility focus|10min mobility).*$/i, (match, group) => {
    // Keep "core circuit" as an item but trim what follows
    return ', ' + group
  })
  
  // Split by comma
  const parts = desc.split(/,\s*/)
  
  return parts.map(part => {
    const trimmed = part.trim()
    if (!trimmed) return null
    
    // Match patterns like "3x12", "3x30s", "2x10", etc.
    const setsRepsMatch = trimmed.match(/^(\d+)x(\d+s?)\s+(.+)$/i)
    
    if (setsRepsMatch) {
      const sets = setsRepsMatch[1]
      const reps = setsRepsMatch[2]
      let exerciseName = setsRepsMatch[3]
      
      // Clean up parentheticals and modifiers for matching but keep for display
      const cleanName = exerciseName
        .replace(/\s*\(.*?\)/g, '')  // remove (each leg), (power), etc.
        .replace(/\s*(light|heavier|heavy|with dumbbells|bodyweight|slow negative|4s down|3s negative|50% weight)\s*/gi, '')
        .trim()
      
      const exercise = findExercise(cleanName)
      
      return {
        sets,
        reps,
        exerciseName: exerciseName.charAt(0).toUpperCase() + exerciseName.slice(1),
        exerciseId: exercise?.id || null,
        rawText: trimmed
      }
    }
    
    // No sets/reps pattern - return as raw text
    const exercise = findExercise(trimmed)
    return {
      sets: null,
      reps: null,
      exerciseName: trimmed.charAt(0).toUpperCase() + trimmed.slice(1),
      exerciseId: exercise?.id || null,
      rawText: trimmed
    }
  }).filter(Boolean)
}

/**
 * Get exercise details by ID
 */
export function getExerciseById(id) {
  return exercises.find(e => e.id === id) || null
}
