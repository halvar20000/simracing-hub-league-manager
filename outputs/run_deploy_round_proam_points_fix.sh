#!/usr/bin/env bash
# Deploy: fix the round results page showing wrong points for Pro/Am
# (GT3 WCT) seasons.
#
# THE BUG
#   RaceResult.rawPointsAwarded stores points for the driver's OVERALL
#   finishing position. For a Pro/Am season the championship points —
#   and the standings page — instead use the driver's position WITHIN
#   their Pro/Am class. So an AM-class winner who finished e.g. P16
#   overall showed ~24 pts in the round result table but correctly
#   showed 40 (35 race + 5 participation) in the standings.
#
# THE FIX
#   The round results page now replicates the standings engine's
#   class-ranking logic: for Pro/Am seasons it ranks each result
#   within its Pro/Am class (non-DSQ/DNS, above racePointsMinDistance-
#   Pct, sorted by overall finish) and looks the class rank up in
#   scoringSystem.pointsTable — exactly what src/lib/standings.ts does.
#
#   classRacePointsByResult (resultId -> race points) is threaded into:
#     * the per-driver Agg used by the Combined / Team / Podium views
#     * ResultsTable (Combined / Race 1+2 / Pro / Am tabs)
#     * CombinedMultiRaceTable (multi-race combined view)
#   Non-Pro/Am seasons are untouched — rawPointsAwarded is already
#   correct for them. Results with no class rank fall back to
#   rawPointsAwarded, matching the standings' own fallback.
#
# Display-only change — no stored values are altered, no DB / schema
# migration. The standings page was already correct.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_round_proam_points_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_round_proam_points_fix.sh
git commit -m "Round results: Pro/Am points match the standings

The round result tables displayed RaceResult.rawPointsAwarded, which
is the OVERALL-position points. For Pro/Am seasons (GT3 WCT) the
championship — and the standings page — score the driver's position
within their Pro/Am class. Result: an AM winner showed ~24 pts on the
round page but a correct 40 in the standings.

Round page now replicates standings.ts: ranks each result within its
Pro/Am class and reads scoringSystem.pointsTable[classRank]. Threaded
through the per-driver Agg, ResultsTable, and CombinedMultiRaceTable.
Non-Pro/Am seasons unchanged. Display-only; no stored data touched." || true
git push

echo "Done."
