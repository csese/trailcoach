/**
 * Authenticated calls to this app's own API routes (/api/*).
 *
 * Sends the user's Supabase access token so server functions can
 * verify identity. Secrets (OAuth client secrets, encryption key)
 * live only on the server.
 */

import { useSupabase } from './useSupabase'

export async function apiFetch(path, body) {
  const { supabase } = useSupabase()
  if (!supabase) throw new Error('Not configured')

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')

  const resp = await fetch(path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`
    },
    body: JSON.stringify(body)
  })

  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(data.error || `Request failed (${resp.status})`)
  }
  return data
}

/**
 * Store integration credentials server-side (encrypted with a
 * server-only key before hitting the database).
 */
export function storeIntegration(provider, credentials, syncEnabled = true) {
  return apiFetch('/api/integrations/store', {
    provider,
    credentials,
    sync_enabled: syncEnabled
  })
}
