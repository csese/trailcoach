/**
 * Server-side Supabase helpers for Vercel functions.
 */

import { createClient } from '@supabase/supabase-js'

// Tolerate stray whitespace/escaped newlines in env values
// (e.g. `vercel env pull` artifacts).
function cleanEnv(value) {
  return (value || '').replace(/\\n/g, '').trim()
}

export function adminClient() {
  const url = cleanEnv(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL)
  const key = cleanEnv(process.env.SUPABASE_SERVICE_ROLE)
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE not configured')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/**
 * Verify the caller's Supabase JWT (Authorization: Bearer <token>).
 * Returns the user object, or null if invalid/missing.
 */
export async function requireUser(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null

  try {
    const { data, error } = await adminClient().auth.getUser(token)
    if (error || !data?.user) return null
    return data.user
  } catch {
    return null
  }
}
