#!/usr/bin/env bash
# Deploy: simplify the Qualifying table on team-event rounds — show only
# Pos, Team, Qualy Lap, Interval. Race Pts / Bonus Pts / Pen / Total /
# Avg Lap / Laps Lead / Laps Compl / Inc. were misleading there because
# qualifying doesn't generate any of those.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_quali_table_simplified.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_quali_table_simplified.sh
git commit -m "Round results: strip race columns from team Quali table

The Qualifying table on team-event rounds was reusing the race row
component, which rendered Race Pts, Bonus Pts, Pen, Total, etc. None
of those apply to qualifying. Replace with a dedicated table: Pos,
Team, Qualy Lap, Interval (gap to class pole)." || true
git push

echo "Done."
