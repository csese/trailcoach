/**
 * Google Health API OAuth code exchange — server side.
 *
 * Exchanges the authorization code for tokens and stores the refresh
 * token encrypted (AES-256-GCM, server-only key). Tokens are never
 * returned to the browser; all Google Health data access is server-side.
 */

import { requireUser, adminClient } from '../_lib/supabase.js'
import { encryptCredentials } from '../_lib/crypto.js'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Google Health integration not configured' })
  }

  const { code, redirect_uri: redirectUri } = req.body || {}
  if (typeof code !== 'string' || typeof redirectUri !== 'string') {
    return res.status(400).json({ error: 'Invalid request' })
  }

  try {
    const resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code'
      })
    })

    if (!resp.ok) {
      console.error(`[google-health/token] Exchange failed: ${resp.status}`, (await resp.text()).slice(0, 300))
      return res.status(502).json({ error: 'Token exchange failed' })
    }

    const data = await resp.json()
    if (!data.refresh_token) {
      // Happens when the user previously consented and Google skips
      // re-issuing a refresh token despite prompt=consent
      return res.status(502).json({
        error: 'Google did not return a refresh token. Remove the app\'s access at myaccount.google.com/permissions, then connect again.'
      })
    }

    let encrypted
    try {
      encrypted = encryptCredentials({ refresh_token: data.refresh_token })
    } catch (e) {
      console.error('[google-health/token] Encryption error:', e.message)
      return res.status(500).json({ error: 'Server encryption not configured' })
    }

    const { error } = await adminClient()
      .from('integrations')
      .upsert(
        {
          user_id: user.id,
          provider: 'google_health',
          credentials: encrypted,
          sync_enabled: true
        },
        { onConflict: 'user_id,provider' }
      )

    if (error) {
      console.error('[google-health/token] DB error:', error.message)
      return res.status(500).json({ error: 'Failed to store integration' })
    }

    return res.status(200).json({ ok: true })
  } catch (e) {
    console.error('[google-health/token] Error:', e)
    return res.status(502).json({ error: 'Token exchange failed' })
  }
}
