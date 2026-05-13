#!/usr/bin/env bash
# Deploy the penalty-pool engine change (NO_RSVP_NO_SHOW excluded from
# auto-forgiveness) and recompute the current GT3 WCT season's pool against
# the live DB so the standings/pool view reflects the new rule immediately.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_pool_fix.sh
#
# NOTE: Step 3 (recompute) needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/3  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/3  Commit + push to GitHub (Vercel auto-deploys main)"
git add src/lib/penalty-pool.ts scripts/lm_recompute_wct_pool.ts outputs/run_deploy_pool_fix.sh
git commit -m "Penalty pool: exclude NO_RSVP_NO_SHOW from auto-forgiveness

No-show penalties are now a separate, permanent demerit. The forgiveness
engine ignores them entirely: they don't contribute to remainingPool, they
aren't picked as 'oldest to forgive', and they don't reset the clean-race
counter. Clean races forgive incident-decision penalties only." || true
git push

echo "==> 3/3  Recompute the current GT3 WCT season pool (live DB)"
npx tsx scripts/lm_recompute_wct_pool.ts

echo ""
echo "Done. The penalty-pool view should now show no-show penalties with 0 auto-forgiven."
