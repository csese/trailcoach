# TrailCoach Security Review — 2026-07-06

Scope: full repo (frontend, Vercel cron API, sync scripts, Supabase migrations, env files, dependencies).

## Critical

### 1. Credential "encryption" key is shipped to the browser
`src/composables/useCredentialEncryption.js` + `.env.example` instruct setting `VITE_CREDENTIAL_ENCRYPTION_KEY` to the **same value** as the server-side `CREDENTIAL_ENCRYPTION_KEY`. Anything prefixed `VITE_` is embedded in the public JS bundle, so anyone who loads the app can extract the key and decrypt every row in `integrations`. The encryption provides no protection against a DB leak — the stated goal in the file's own comment.

Compounding issues:
- `crypto-js` `AES.encrypt(json, key)` with a string key uses the legacy MD5-based `EVP_BytesToKey` KDF — weak even if the key were secret.
- `encryptCredentials()` silently **falls back to plaintext** (console.warn only) when the key is missing or encryption throws.
- `decryptCredentials()` in `scripts/sync-runner.js` returns the raw stored object on decryption failure.

Fix: never send the key to the client. Do all credential writes through a server endpoint (Vercel function) that encrypts with a server-only key using WebCrypto/Node `crypto` (AES-256-GCM with random IV), or use Supabase Vault / pgsodium. Remove the plaintext fallbacks — fail closed.

### 2. Third-party passwords stored in the database
Eight Sleep and Garmin **email + password** are collected in `SettingsView.vue` and stored in `integrations.credentials` (encrypted only by the broken scheme above). Given #1, these are effectively recoverable plaintext passwords for users' other accounts. `useBiometrics.js` also sends the Eight Sleep password directly from the browser.

Fix: prefer OAuth wherever available; if password auth is unavoidable (Eight Sleep), exchange for a session token server-side and store only the token. Never store the password.

## High

### 3. OAuth client secrets in the frontend bundle
- `useStrava.js` reads `VITE_STRAVA_CLIENT_SECRET` and sends it from the browser (token exchange + refresh).
- `useGarminConnect.js` `exchangeCode()` takes `clientSecret` in browser code.

`VITE_` secrets are public. Anyone can extract the Strava client secret and impersonate the app.

Fix: move token exchange/refresh into a serverless function; the browser should only ever see the authorization code and its own access token.

### 4. Cron endpoint fails open
`api/cron/sync.js`:
```js
if (cronSecret && authHeader !== `Bearer ${cronSecret}`) return 401
```
If `CRON_SECRET` is unset in any environment, the check is skipped entirely and anyone can trigger a full sync (which uses the service-role key). Fix: require the secret — `if (!cronSecret || authHeader !== ...) return 401`. Use a constant-time comparison if you want to be thorough.

Also note: Vercel cron invokes the path with **GET**, but the handler rejects non-POST — the scheduled job likely never runs (functional, but it means syncs may silently not happen).

### 5. Vulnerable dependencies
`npm audit`: 17 vulnerabilities (10 high). Production-relevant: `ws` 8.x (memory disclosure, DoS) and `postcss` (XSS in stringify). `npm audit fix` resolves the non-breaking ones.

## Medium

### 6. Live secrets sitting in the project folder
`.env.local` contains a live `CRON_SECRET`, `SUPABASE_SERVICE_ROLE` key, and a Vercel OIDC token. `.gitignore` correctly excludes it and git history is clean (verified: no env files ever committed). But the folder was just shared into an AI tool session, and any backup/sync of this directory carries the service-role key. Recommend rotating `SUPABASE_SERVICE_ROLE` and `CRON_SECRET` after this review, and generally treating `.env.local` as radioactive.

Also: both `SUPABASE_URL` values in `.env.local` contain a literal `\n` suffix — likely breaking the sync script's Supabase client.

### 7. Cron response leaks internals
The cron handler returns `error.message` to the caller. Combined with #4 (unauthenticated access when secret is unset), this can leak DB/API error details. Return a generic error; keep details in logs.

## Low / hardening

- **No security headers**: `vercel.json` sets no CSP, `X-Frame-Options`, `Referrer-Policy`, or HSTS. Add a `headers` block.
- **`sync_logs` orchestrator insert** uses `user_id: 'system'` — will fail if the column is UUID, and RLS `WITH CHECK (auth.uid() = user_id)` only matters for anon-key clients anyway (service role bypasses RLS; that's expected).
- **`.mcp.json`** exposes a Supabase project ref — harmless alone, fine to keep.
- **Two different Supabase projects** referenced (`dvcvlwxyxrufqctinyde` in `.env`/`.mcp.json`, `ljlpokstfcmmlepmjdkw` in `.env.local`) — worth confirming which is live so stale keys can be revoked.

## What's in good shape

- RLS is enabled on **all** tables across all four migrations, with per-operation `auth.uid() = user_id` policies — solid multi-tenant isolation for anon-key access.
- `.env` / `.env.local` are gitignored and were never committed (git history checked).
- No `v-html`/`innerHTML` usage found — minimal DOM XSS surface.
- Supabase anon/publishable key in the bundle is fine by design (RLS is the guard).
- Auth uses Supabase's built-in email/password flow — no hand-rolled session handling.

## Priority order

1. Rotate the Supabase service-role key + `CRON_SECRET` (5 min).
2. Fix the cron fail-open check (1 line).
3. Move Strava/Garmin token exchange server-side; remove `VITE_*_SECRET` vars.
4. Redesign credential storage: server-side AES-GCM (or Supabase Vault), no client key, no plaintext fallback; stop storing Eight Sleep/Garmin passwords.
5. `npm audit fix`.
6. Add security headers.
