#!/usr/bin/env bash
# Deploy: IEC round-results race points fall back to pointsTable[classPosition]
# when TeamResult.rawPointsAwarded is 0 (which is the normal state for IEC
# imports). Now matches the standings cumulative.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iec_race_points_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_iec_race_points_fix.sh
git commit -m "Round results: derive team race points from pointsTable when stored is 0

For IEC, TeamResult.rawPointsAwarded is typically 0 at import time and the
season standings derive race points dynamically from
scoringSystem.pointsTable[classPosition]
(see computeTeamClassStandings). Apply the same fallback in the per-round
team tables so the Race Pts column populates and matches the standings
cumulative." || true
git push

echo "Done."
