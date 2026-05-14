#!/usr/bin/env bash
# Deploy: round-page Bonus Pts column now includes team participation AND
# dynamic driver-FPR (the columns used by the standings cumulative), not
# just legacy FPRAward rows. So Race Pts + Bonus Pts − Pen on the round
# now matches the per-round contribution shown in the season standings.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_team_bonus_points.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_team_bonus_points.sh
git commit -m "Round results: Bonus Pts includes team participation + driver-FPR

Previously the round-page Bonus Pts column only read FPRAward rows
(legacy team-FPR persisted via recomputeRoundFPR). IEC seasons compute
team-level FPR dynamically via driverFprEnabled/driverFprTiers/
driverFprMinDistancePct, and award team participation via
participationPoints/participationMinDistancePct — neither of which
showed in the round table, even though both contribute to the season
standings cumulative.

Match computeTeamClassStandings in src/lib/standings.ts:
  Bonus Pts = participation + driver-FPR + (legacy FPRAward, for back-compat)
where participation kicks in at raceDistancePct >= participationMinPct
and FPR kicks in at raceDistancePct >= driverFprMinDistancePct, indexed
by team totalIncidents through readDriverFprTiers/fprPointsForIncidents." || true
git push

echo "Done."
