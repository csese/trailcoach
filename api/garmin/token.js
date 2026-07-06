/**
 * Garmin Connect OAuth token exchange — server side.
 *
 * Keeps GARMIN_CLIENT_SECRET out of the browser bundle.
 */

import { requireUser } from '../_lib/supabase.js'

const GARMIN_TOKEN_URL = 'https://connect.garmin.com/oauth/token'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const user = await requireUser(req)
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const clientId = process.env.GARMIN_CLIENT_ID
  const clientSecret = process.env.GARMIN_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    return res.status(500).json({ error: 'Garmin integration not configured' })
  }

  const { code, redirect_uri: redirectUri } = req.body || {}
  if (typeof code !== 'string' || typeof redirectUri !== 'string') {
    return res.status(400).json({ error: 'Invalid request' })
  }

  try {
    const resp = await fetch(GARMIN_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri
      })
    })

    if (!resp.ok) {
      console.error(`[garmin/token] Exchange failed: ${resp.status}`)
      return res.status(502).json({ error: 'Token exchange failed' })
    }

    return res.status(200).json(await resp.json())
  } catch (e) {
    console.error('[garmin/token] Error:', e)
    return res.status(502).json({ error: 'Token exchange failed' })
  }
}
