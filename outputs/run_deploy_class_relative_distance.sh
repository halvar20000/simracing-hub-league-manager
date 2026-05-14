#!/usr/bin/env bash
# Deploy: class-relative race-distance gate. The 90% race-points gate
# (and the participation/FPR gates) now compare a team's lapsCompleted
# against the CLASS LEADER's lapsCompleted, not the overall session max.
# Fixes the GT4-zero-points bug in multi-class IEC where slower classes
# always failed the gate because LMP2 runs many more laps.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_class_relative_distance.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/standings.ts \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_class_relative_distance.sh
git commit -m "IEC: race-distance gate is class-relative (fixes GT4 zero points)

TeamResult.raceDistancePct is computed against the session-wide max
laps. In multi-class IEC the LMP2 leader runs far more laps than the
GT4 leader, so every GT4 team was failing the 90% race-points gate
even when they finished their full race.

Compute distance% relative to the team's CLASS leader instead:
  classDistance = lapsCompleted / class-leader lapsCompleted

Applied to race points, participation, and driver-FPR gates in both:
  - computeTeamClassStandings (standings)
  - buildTeamRowSummary (round page)
DSQ forfeit behaviour unchanged." || true
git push

echo "Done."
