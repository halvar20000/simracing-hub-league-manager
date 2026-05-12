#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f ".env" ]; then set -a; source .env; set +a; fi

echo "=== Env vars present locally ==="
echo "  RESEND_API_KEY = ${RESEND_API_KEY:+(set)}"
echo "  RESEND_FROM    = ${RESEND_FROM:-(default: CLS Registrations <noreply@simracing-hub.com>)}"
echo ""
echo "=== NB: env vars must ALSO be set in Vercel for production. ==="
echo "    Go to Vercel → Project → Settings → Environment Variables."
echo ""

echo "=== Is the email block actually in src/lib/actions/registrations.ts? ==="
grep -n "sendResendEmail\|Fire-and-forget email notification" src/lib/actions/registrations.ts || echo "(NO references found — the email block is missing!)"

echo ""
echo "=== Persisted recipients on GT4 TSS league ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.league.findUnique({ where: { slug: 'cas-tss-gt4' } }).then(l => {
  if (!l) { console.log('(not found)'); return; }
  console.log('  registrationNotifyEmails: ' + JSON.stringify(l.registrationNotifyEmails));
  return p.\$disconnect();
});
"

echo ""
echo "=== Live Resend send test (will hit Resend if RESEND_API_KEY is set) ==="
if [ -z "${RESEND_API_KEY:-}" ]; then
  echo "  Skipped — RESEND_API_KEY not in local .env."
  echo "  This still means production will work IF you set it in Vercel."
else
  TO="${RESEND_TEST_TO:-thomas.herbrig@gmail.com}"
  FROM="${RESEND_FROM:-CLS Registrations <noreply@simracing-hub.com>}"
  echo "  Sending test email to $TO from $FROM ..."
  RESP=$(curl -s -w '\n--HTTPSTATUS:%{http_code}' \
    -X POST https://api.resend.com/emails \
    -H "Authorization: Bearer $RESEND_API_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"from\":\"$FROM\",\"to\":[\"$TO\"],\"subject\":\"CLS test email\",\"text\":\"This is a test email from CLS.\"}")
  BODY=$(echo "$RESP" | sed '$d')
  STATUS=$(echo "$RESP" | tail -1 | sed 's/--HTTPSTATUS://')
  echo "  HTTP status: $STATUS"
  echo "  Body: $BODY"
fi
