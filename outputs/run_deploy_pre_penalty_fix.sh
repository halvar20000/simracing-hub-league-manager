#!/usr/bin/env bash
# Deploy the pre-penalty-clean-races fix: clean races before a driver's first
# penalty no longer pre-credit forgiveness for that penalty. Then recompute
# the current GT3 WCT season's pool against the live DB.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_pre_penalty_fix.sh
#
# NOTE: Step 3 (recompute) needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/3  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/3  Commit + push to GitHub (Vercel auto-deploys main)"
git add \
  src/lib/penalty-pool.ts \
  outputs/run_deploy_pre_penalty_fix.sh
git commit -m "Penalty pool: clean races before first penalty don't pre-credit

The forgiveness engine walked rounds in ascending order from R1, ticking
the clean-race counter even before the driver had incurred any penalty.
That pre-credited a later penalty's forgiveness — e.g. Dennis Ulli
Richter (3 pts in R4 + 3 clean R5-R7) was getting 2 points forgiven
because R1-R3 had already half-filled the counter before R4. Track a
'hasIncurredAnyPenaltyYet' flag and only tick the counter from after
the driver's first penalty." || true
git push

echo "==> 3/3  Recompute the current GT3 WCT season pool (live DB)"
npx tsx scripts/lm_recompute_wct_pool.ts

echo ""
echo "Done. Richter should now show 1 auto-forgiven on his R4 penalty (instead of 2)."
