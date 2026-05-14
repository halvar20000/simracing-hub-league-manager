#!/usr/bin/env bash
# Deploy: DSQ teams forfeit all scoring (race + participation + FPR) for
# the round. Mirrors the driver-DSQ forfeit rule.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_team_dsq_forfeit.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/standings.ts \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_team_dsq_forfeit.sh
git commit -m "Team scoring: DSQ teams forfeit race + participation + FPR

Mirror the driver-DSQ forfeit rule (recomputeDsqForfeitForRound) for the
team class. A TeamResult with finishStatus = DSQ now receives 0 across
race points, participation, and FPR for the round. Manual penalty +
correction still apply. Applied in both:
  - computeTeamClassStandings (standings)
  - buildTeamRowSummary (round page)" || true
git push

echo "Done."
