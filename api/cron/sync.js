/**
 * Vercel Cron API Route
 * 
 * Runs the daily biometrics sync on a schedule.
 * Configured in vercel.json as a cron job.
 * 
 * Protected by CRON_SECRET environment variable.
 * 
 * @cron schedule: "0 3 * * *" (runs at 3:00 UTC daily)
 */

import { timingSafeEqual } from 'node:crypto'
import { runSync } from '../../scripts/sync-runner.js'

function isAuthorized(req) {
  const cronSecret = process.env.CRON_SECRET
  // Fail closed: no configured secret means no access.
  if (!cronSecret) return false

  const header = req.headers.authorization || ''
  const expected = Buffer.from(`Bearer ${cronSecret}`)
  const provided = Buffer.from(header)
  return expected.length === provided.length && timingSafeEqual(expected, provided)
}

export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Vercel cron invokes with GET; allow manual POST triggers too
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const startTime = Date.now()
  const timestamp = new Date().toISOString()

  try {
    console.log(`[cron] Starting daily sync at ${timestamp}`)
    
    // Run the sync orchestrator
    await runSync()
    
    const duration = Date.now() - startTime
    console.log(`[cron] Sync completed in ${duration}ms`)
    
    return res.status(200).json({
      success: true,
      timestamp,
      duration_ms: duration,
      message: 'Daily sync completed successfully'
    })
    
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`[cron] Sync failed after ${duration}ms:`, error)
    
    // Details stay in server logs; don't leak internals to the caller
    return res.status(500).json({
      success: false,
      timestamp,
      duration_ms: duration,
      error: 'Sync failed'
    })
  }
}

// Required for Vercel cron jobs
export const config = {
  maxDuration: 300, // 5 minute timeout
}
