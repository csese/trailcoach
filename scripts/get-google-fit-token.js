#!/usr/bin/env bun
/**
 * Google Fit OAuth Token Generator
 * 
 * This script walks you through the OAuth 2.0 flow to get a refresh token
 * for the Google Fit REST API.
 * 
 * Usage:
 *   bun scripts/get-google-fit-token.js
 * 
 * Environment variables needed:
 *   GOOGLE_CLIENT_ID - from Google Cloud Console
 *   GOOGLE_CLIENT_SECRET - from Google Cloud Console
 */

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET
const REDIRECT_URI = 'http://localhost:3000/auth/callback'

// Google Fit scopes
const SCOPES = [
  'https://www.googleapis.com/auth/fitness.sleep.read',
  'https://www.googleapis.com/auth/fitness.body.read',
  'https://www.googleapis.com/auth/fitness.activity.read'
].join(' ')

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('❌ GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables required')
  console.error('Set them with: export GOOGLE_CLIENT_ID=your-client-id GOOGLE_CLIENT_SECRET=your-secret')
  process.exit(1)
}

console.log('🔐 Google Fit OAuth Token Generator\n')
console.log('Scopes requested:')
console.log('  - fitness.sleep.read (sleep data)')
console.log('  - fitness.body.read (body metrics)')
console.log('  - fitness.activity.read (activity data)')
console.log()

// Build auth URL
const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
authUrl.searchParams.set('client_id', CLIENT_ID)
authUrl.searchParams.set('redirect_uri', REDIRECT_URI)
authUrl.searchParams.set('scope', SCOPES)
authUrl.searchParams.set('access_type', 'offline')
authUrl.searchParams.set('prompt', 'consent') // Forces refresh token
authUrl.searchParams.set('response_type', 'code')

console.log('Step 1: Open this URL in your browser to authorize:')
console.log(`\n${authUrl.toString()}\n`)
console.log('Step 2: After granting permission, you will be redirected to:')
console.log(`  ${REDIRECT_URI}?code=YOUR_CODE`)
console.log('\nStep 3: Copy the code parameter from the redirect URL')
console.log('        (the part after "code=" and before any "&")')
console.log('\n---')

// Start a simple HTTP server to catch the redirect
import { createServer } from 'http'

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')

  if (code) {
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end('<html><body><h1>✅ Success!</h1><p>You can close this window.</p></body></html>')

    console.log('\n✅ Authorization code received!')
    console.log('Exchanging for tokens...\n')

    try {
      const tokenResp = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          grant_type: 'authorization_code',
          redirect_uri: REDIRECT_URI
        })
      })

      const tokens = await tokenResp.json()

      if (tokens.refresh_token) {
        console.log('🎉 SUCCESS! Your Google Fit refresh token is:')
        console.log(`\n${tokens.refresh_token}\n`)
        console.log('Add this to your Vercel environment variables:')
        console.log('  GOOGLE_FIT_REFRESH_TOKEN=<the-token-above>')
        console.log('\nAlso add your client credentials:')
        console.log('  GOOGLE_CLIENT_ID=<your-client-id>')
        console.log('  GOOGLE_CLIENT_SECRET=<your-client-secret>')
        console.log('\nRun these commands:')
        console.log(`  vercel env add GOOGLE_FIT_REFRESH_TOKEN production`)
        console.log(`  vercel env add GOOGLE_CLIENT_ID production`)
        console.log(`  vercel env add GOOGLE_CLIENT_SECRET production`)
      } else if (tokens.error) {
        console.error('❌ OAuth error:', tokens.error_description || tokens.error)
      } else {
        console.error('❌ No refresh token received. Make sure you set prompt=consent')
        console.log(JSON.stringify(tokens, null, 2))
      }
    } catch (e) {
      console.error('❌ Token exchange failed:', e.message)
    }

    server.close()
  }
})

const PORT = 3000
server.listen(PORT, () => {
  console.log(`\n Listening on http://localhost:${PORT} for the redirect...`)
  console.log('(No browser opening automatically — please open the URL above manually)\n')
})
