#!/usr/bin/env bash
# Deploy: incidents tiebreaker for driver standings (all leagues).
# When two drivers have identical points, the one with fewer total incidents
# ranks higher. Inserts as the primary tiebreaker after classTotal; existing
# classRawPoints / roundsCompleted / lastName fallbacks stay below.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_incidents_tiebreaker.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push to GitHub (Vercel auto-deploys main)"
git add src/lib/standings.ts outputs/run_deploy_incidents_tiebreaker.sh
git commit -m "Standings: fewer incidents wins on points tie

For all leagues, when two drivers have identical season points, the one
with fewer total incidents now ranks higher. Inserts as the primary
tiebreaker after classTotal in the driver standings sort. Existing
secondary tiebreakers (classRawPoints, roundsCompleted, lastName) are
retained below." || true
git push

echo "Done. Standings will recalculate on the next page load (no DB write needed — sort happens at read time)."
