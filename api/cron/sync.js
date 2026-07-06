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

import { runSync } from '../../scripts/sync-runner.js'

export default async function handler(req, res) {
  // Verify this is a legitimate cron request
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Only allow POST
  if (req.method !== 'POST') {
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
    
    return res.status(500).json({
      success: false,
      timestamp,
      duration_ms: duration,
      error: error.message
    })
  }
}

// Required for Vercel cron jobs
export const config = {
  maxDuration: 300, // 5 minute timeout
}
