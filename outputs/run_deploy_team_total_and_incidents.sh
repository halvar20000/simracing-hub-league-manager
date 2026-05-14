#!/usr/bin/env bash
# Deploy: add Incidents and Total columns to the team race/quali tables.
#   Inc.   = TeamResult.totalIncidents
#   Total  = Race Pts + Bonus Pts  (penalty is shown separately)
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_team_total_and_incidents.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_team_total_and_incidents.sh
git commit -m "Round results: add Inc. and Total columns to team tables

- Inc.: team totalIncidents (between Laps Compl. and Race Pts.)
- Total: Race Pts + Bonus Pts (orange, right-most column)
Penalty is shown separately as before." || true
git push

echo "Done."
