#!/usr/bin/env bash
#
# Post-hardening verification for TrailCoach.
#
# Usage:
#   bash scripts/verify-security.sh            # all safe checks
#   bash scripts/verify-security.sh --live     # also triggers a real sync
#                                              # using CRON_SECRET from .env.local
#
# Run `vercel env pull .env.local` first so .env.local has current values.

set -u
DOMAIN="${DOMAIN:-https://trailcoach.vercel.app}"
# Old, rotated secret — must be rejected. Safe to hardcode once dead.
OLD_CRON_SECRET="880d9feeb5af7edd7b590565864079149cd91288f955a8b6c7f8fa9631458e42"

pass=0; fail=0
check() { # label expected actual
  if [ "$2" = "$3" ]; then echo "  ✅ $1 ($3)"; pass=$((pass+1));
  else echo "  ❌ $1 — expected $2, got $3"; fail=$((fail+1)); fi
}

echo "── 1. Security headers on $DOMAIN"
H=$(curl -sI --max-time 15 "$DOMAIN/")
for h in content-security-policy x-frame-options x-content-type-options strict-transport-security referrer-policy permissions-policy; do
  if echo "$H" | grep -qi "^$h:"; then echo "  ✅ $h present"; pass=$((pass+1));
  else echo "  ❌ $h MISSING"; fail=$((fail+1)); fi
done

echo "── 2. Cron endpoint fails closed"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$DOMAIN/api/cron/sync")
check "no auth rejected" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 \
  -H "Authorization: Bearer $OLD_CRON_SECRET" "$DOMAIN/api/cron/sync")
check "OLD rotated secret rejected" 401 "$code"

echo "── 3. New API routes deployed & reject unauthenticated calls"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST \
  -H "content-type: application/json" -d '{}' "$DOMAIN/api/strava/token")
check "/api/strava/token unauth" 401 "$code"
code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 -X POST \
  -H "content-type: application/json" -d '{}' "$DOMAIN/api/integrations/store")
check "/api/integrations/store unauth" 401 "$code"

echo "── 4. No secrets in the deployed JS bundle"
assets=$(curl -s --max-time 15 "$DOMAIN/" | grep -oE '/assets/[^"]+\.js' | head -5)
leak=0
for a in $assets; do
  if curl -s --max-time 20 "$DOMAIN$a" | grep -qE "sb_secret|CREDENTIAL_ENCRYPTION|client_secret"; then
    echo "  ❌ secret marker found in $a"; leak=1; fail=$((fail+1))
  fi
done
[ "$leak" = 0 ] && { echo "  ✅ no secret markers in bundle"; pass=$((pass+1)); }

if [ "${1:-}" = "--live" ]; then
  echo "── 5. Live cron trigger with current secret (runs a real sync)"
  CUR=$(grep -E '^CRON_SECRET=' .env.local | sed 's/^CRON_SECRET=//; s/"//g')
  if [ -z "$CUR" ]; then
    echo "  ⚠️  CRON_SECRET not found in .env.local — run: vercel env pull .env.local"
  else
    resp=$(curl -s --max-time 300 -H "Authorization: Bearer $CUR" "$DOMAIN/api/cron/sync")
    echo "  response: $resp"
    echo "$resp" | grep -q '"success":true' && { echo "  ✅ sync ran with new secret"; pass=$((pass+1)); } \
      || { echo "  ❌ sync did not succeed"; fail=$((fail+1)); }
  fi
fi

echo
echo "Result: $pass passed, $fail failed"
[ "$fail" = 0 ] && echo "🎉 All checks passed" || echo "⚠️  Review failures above — most common cause: changes not deployed yet"
