/**
 * Store integration credentials — server side.
 *
 * Credentials are encrypted with AES-256-GCM using a server-only key
 * before being written to the `integrations` table. The browser never
 * sees the encryption key and cannot read credentials back.
 */

import { requireUser, adminClient } from '../_lib/supabase.js'
import { encryptCredentials } from '../_lib/crypto.js'

const ALLOWED_PROVIDERS = ['eight_sleep', 'garmin_connect', 'strava']

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { provider, credentials, sync_enabled: syncEnabled = true } = req.body || {}

  if (!ALLOWED_PROVIDERS.includes(provider)) {
    return res.status(400).json({ error: 'Unknown provider' })
  }
  if (!credentials || typeof credentials !== 'object' || Array.isArray(credentials)) {
    return res.status(400).json({ error: 'Invalid credentials payload' })
  }

  let encrypted
  try {
    encrypted = encryptCredentials(credentials)
  } catch (e) {
    console.error('[integrations/store] Encryption error:', e.message)
    return res.status(500).json({ error: 'Server encryption not configured' })
  }

  try {
    const { error } = await adminClient()
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          provider,
          credentials: encrypted,
          sync_enabled: !!syncEnabled,
          last_sync: new Date().toISOString()
        },
        { onConflict: 'user_id,provider' }
      )

    if (error) {
      console.error('[integrations/store] DB error:', error.message)
      return res.status(500).json({ error: 'Failed to store integration' })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[integrations/store] Error:', e)
    return res.status(500).json({ error: 'Failed to store integration' })
  }
}
