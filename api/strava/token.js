/**
 * Strava OAuth token exchange & refresh — server side.
 *
 * Keeps STRAVA_CLIENT_SECRET out of the browser bundle. The frontend
 * sends the authorization code (or refresh token) with the user's
 * Supabase JWT; this function performs the exchange and returns the
 * token response.
 */

import { requireUser } from '../_lib/supabase.js'

const STRAVA_TOKEN_URL = 'https://www.strava.com/oauth/token'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const clientId = process.env.STRAVA_CLIENT_ID || process.env.VITE_STRAVA_CLIENT_ID
  const clientSecret = process.env.STRAVA_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Strava integration not configured' })
  }

  const { grant_type: grantType, code, refresh_token: refreshToken } = req.body || {}

  let body
  if (grantType === 'authorization_code' && typeof code === 'string') {
    body = { client_id: clientId, client_secret: clientSecret, grant_type: grantType, code }
  } else if (grantType === 'refresh_token' && typeof refreshToken === 'string') {
    body = { client_id: clientId, client_secret: clientSecret, grant_type: grantType, refresh_token: refreshToken }
  } else {
    return res.status(400).json({ error: 'Invalid request' })
  }

  try {
    const resp = await fetch(STRAVA_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    if (!resp.ok) {
      console.error(`[strava/token] Exchange failed: ${resp.status}`)
      return res.status(502).json({ error: 'Token exchange failed' })
    }

    return res.status(200).json(await resp.json())
  } catch (e) {
    console.error('[strava/token] Error:', e)
    return res.status(502).json({ error: 'Token exchange failed' })
  }
}
