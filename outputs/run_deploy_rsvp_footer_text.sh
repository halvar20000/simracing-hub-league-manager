#!/usr/bin/env bash
# Deploy: drop "(GT3 WCT)" from the DECLINE_ONLY embed footer.
# Now reads: "No-shows without a Decline incur a penalty point."
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_rsvp_footer_text.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/discord-rsvp-embed.ts \
  outputs/run_deploy_rsvp_footer_text.sh
git commit -m "RSVP embed: drop (GT3 WCT) qualifier from no-show footer text" || true
git push

echo ""
echo "Done. After deploy, hit 'Refresh embed' on any open RSVP post to update"
echo "the footer in place (Discord doesn't auto-refresh)."
