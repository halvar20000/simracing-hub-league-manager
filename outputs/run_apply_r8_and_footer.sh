#!/usr/bin/env bash
# Apply BOTH pending fixes for the SFL R8 Spa RSVP post:
#   1. DB: update Round.startsAt for R8 Spa  → 17:00 UTC (= 19:00 CEST)
#   2. Code: drop "(GT3 WCT)" from the no-show footer text
#
# Idempotent — safe to re-run. After this finishes successfully, click
# "Refresh embed" in /admin/leagues/cas-sfl-cup/seasons/.../rounds/<R8>/rsvp
# to update the existing Discord message in place.
#
# Run from your Mac terminal:
#   bash outputs/run_apply_r8 _and_footer.sh
#
# Needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  Update R8 Spa startsAt in DB (19:00 UTC → 17:00 UTC)"
APPLY=1 npx tsx scripts/lm_fix_sfl_r8_spa_start_time.ts

echo "==> 2/4  TypeScript check (footer change)"
npx tsc --noEmit -p tsconfig.json

echo "==> 3/4  Commit + push if anything to commit"
git add src/lib/discord-rsvp-embed.ts outputs/run_apply_r8_and_footer.sh
if ! git diff --staged --quiet; then
  git commit -m "RSVP embed: drop (GT3 WCT) qualifier from no-show footer text"
  git push
else
  echo "  (no code changes staged — already pushed)"
fi

echo "==> 4/4  Done."
echo ""
echo "Wait ~30s for Vercel to redeploy, then click 'Refresh embed' on:"
echo "  /admin/leagues/cas-sfl-cup/seasons/<SEASON>/rounds/<R8>/rsvp"
echo "The post should now show 19:00 and a clean footer."
