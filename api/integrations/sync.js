/**
 * Manual "Sync Now" — server side.
 *
 * Provider APIs (Eight Sleep, Google Fit, Garmin) don't allow
 * cross-origin browser calls, so manual sync runs here, using the
 * same code path as the nightly cron.
 *
 * POST { provider, credentials? }
 * - If credentials are provided, they are encrypted (AES-256-GCM,
 *   server-only key) and upserted first.
 * - Then the provider sync runs for the authenticated user.
 */

import { requireUser, adminClient } from '../_lib/supabase.js'
import { encryptCredentials } from '../_lib/crypto.js'
import { syncProvider, generateDailySummaries } from '../../scripts/sync-runner.js'

const ALLOWED_PROVIDERS = ['eight_sleep', 'garmin_connect', 'google_health']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { provider, credentials } = req.body || {}
  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Unknown provider' })
  }

  let supabase
  try {
    supabase = adminClient()
  } catch (e) {
    console.error('[integrations/sync] Config error:', e.message)
    return res.status(500).json({ error: 'Server not configured' })
  }

  try {
    // 1. Store (encrypted) credentials if provided
    if (credentials && typeof credentials === 'object' && !Array.isArray(credentials)) {
      let encrypted
      try {
        encrypted = encryptCredentials(credentials)
      } catch (e) {
        console.error('[integrations/sync] Encryption error:', e.message)
        return res.status(500).json({ error: 'Server encryption not configured' })
      }

      const { error: upsertError } = await supabase
        .from('integrations')
        .upsert(
          {
            user_id: user.id,
            provider,
            credentials: encrypted,
            sync_enabled: true
          },
          { onConflict: 'user_id,provider' }
        )

      if (upsertError) {
        console.error('[integrations/sync] Upsert error:', upsertError.message)
        return res.status(500).json({ error: 'Failed to store integration' })
      }
    }

    // 2. Load the integration row
    const { data: integration, error: loadError } = await supabase
      .from('integrations')
      .select('*')
      .eq('user_id', user.id)
      .eq('provider', provider)
      .single()

    if (loadError || !integration) {
      return res.status(404).json({ error: 'Integration not configured' })
    }

    // 3. Run the sync (same code path as the nightly cron)
    const result = await syncProvider(supabase, user.id, integration, 'manual')

    // 4. Refresh daily summaries if anything was stored
    if (result.stored > 0) {
      await generateDailySummaries(supabase, user.id)
    }

    return res.status(200).json({
      status: result.status,
      fetched: result.fetched,
      stored: result.stored,
      error: result.error || null
    })
  } catch (e) {
    console.error('[integrations/sync] Error:', e)
    return res.status(500).json({ error: 'Sync failed' })
  }
}

export const config = {
  maxDuration: 60
}
