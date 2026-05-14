#!/usr/bin/env bash
# Follow-up deploy: the previous fix changed the sort inside computeDriverStandings,
# but the standings PAGE re-sorts the drivers locally with its own sortByCombined
# (and another sort in the by-rounds view). Both now include the incidents
# tiebreaker so Waack ranks above Herbrig when they tie on 166 points.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_incidents_tiebreaker_fix.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx" \
  outputs/run_deploy_incidents_tiebreaker_fix.sh
git commit -m "Standings page: apply incidents tiebreaker at the page sort sites

The previous commit added totalIncidents as a tiebreaker in
computeDriverStandings, but the standings page does its own re-sort
(sortByCombined and the by-rounds view sort), which overrode the engine's
order. Add the tiebreaker to both page-level sorts so the rule is honoured
in the rendered standings." || true
git push

echo "Done."
