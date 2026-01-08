import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Read CSV file
const csvPath = path.join(__dirname, '../../training_plan_nice100k.csv')
const csvContent = fs.readFileSync(csvPath, 'utf-8')

// Parse CSV
const lines = csvContent.split('\n')
const headers = lines[0].split(',').map(h => h.trim())

const workouts = []

for (let i = 1; i < lines.length; i++) {
  const line = lines[i]
  if (!line.trim()) continue

  // Handle quoted fields with commas
  const values = []
  let current = ''
  let inQuotes = false

  for (let char of line) {
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  values.push(current.trim())

  const workout = {}
  headers.forEach((header, index) => {
    // Clean header names
    const cleanHeader = header.replace(/[^a-zA-Z0-9]/g, '')
    workout[cleanHeader] = values[index] || ''
  })

  workouts.push(workout)
}

// Write JSON file
const outputPath = path.join(__dirname, '../src/data/trainingPlan.json')
fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, JSON.stringify(workouts, null, 2))

console.log(`Converted ${workouts.length} workouts to JSON`)
console.log(`Output: ${outputPath}`)
