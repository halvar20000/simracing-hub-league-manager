#!/usr/bin/env bash
# Deploy: hide the FPR awards section on team-event rounds (IEC). FPR is
# already rolled into the Bonus Pts column on the team race/quali tables.
# Non-team leagues continue to show the FPR awards section when present.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_hide_team_fpr_section.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_hide_team_fpr_section.sh
git commit -m "Round results: hide FPR awards section on team-event rounds

FPR points are already shown in the Bonus Pts column on the team race
and qualifying tables. The dedicated FPR awards section below was
redundant on IEC rounds. Non-team leagues (FPR awards still relevant)
unaffected." || true
git push

echo "Done."
