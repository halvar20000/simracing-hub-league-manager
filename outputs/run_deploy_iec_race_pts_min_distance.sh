#!/usr/bin/env bash
# Deploy: enforce ScoringSystem.racePointsMinDistancePct for team class.
# Teams under the threshold get 0 race points. Applied in both
# computeTeamClassStandings (standings) and buildTeamRowSummary (round page).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iec_race_pts_min_distance.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/standings.ts \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_iec_race_pts_min_distance.sh
git commit -m "Standings/round: gate team race points by racePointsMinDistancePct

A team that didn't reach scoringSystem.racePointsMinDistancePct of the
race distance now receives 0 race points (matches the IEC rule:
no points below 90% race distance). Applied in both:
  - computeTeamClassStandings (season standings cumulative)
  - buildTeamRowSummary (round-page Race Pts column)

The threshold is read from the existing ScoringSystem field and falls
back to 50 if unset. Set the IEC scoring system to 90 with
scripts/lm_set_iec_race_pts_min_distance.ts." || true
git push

echo "Done. After deploy, run: APPLY=1 bash outputs/run_set_iec_race_pts_min_distance.sh"
echo "  to set racePointsMinDistancePct=90 on the IEC scoring system."
