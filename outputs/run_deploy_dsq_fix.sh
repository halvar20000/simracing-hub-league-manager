#!/usr/bin/env bash
# Deploy the DSQ-is-not-clean-race fix:
#   - Engine + both pool pages now only count CLASSIFIED and DNF as "entered
#     and raced cleanly". DNS (no-start) and DSQ (disqualified) are excluded.
# Then recompute the current GT3 WCT season's pool.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_dsq_fix.sh
#
# NOTE: Step 3 (recompute) needs Postgres 5432 → use phone hotspot, not office WiFi.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/3  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/3  Commit + push to GitHub (Vercel auto-deploys main)"
git add \
  src/lib/penalty-pool.ts \
  "src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx" \
  outputs/run_deploy_dsq_fix.sh
git commit -m "Penalty pool: DSQ is not a clean race

Previous fix only excluded DNS. A DSQ result (disqualified) is the
opposite of a clean race — it must not tick the forgiveness counter
either. Narrow the filter to CLASSIFIED + DNF only; everything else
(DNS, DSQ) is treated as 'did not race cleanly'." || true
git push

echo "==> 3/3  Recompute the current GT3 WCT season pool (live DB)"
npx tsx scripts/lm_recompute_wct_pool.ts

echo ""
echo "Done. Krieger's R3 DSQ should now render as a dash and not contribute to clean-race counting."
