#!/usr/bin/env bash
# Deploy: IEC round results view shows classes + teams only, matching the
# standings view. Driver-centric tabs (Combined, Quali, Race 1/2, Pro/Am,
# Team, By Car) are hidden when the round has TeamResult rows. The default
# tab becomes "Teams" which renders RoundTeamSection (class-grouped team
# standings with embedded participating drivers).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iec_round_results.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_iec_round_results.sh
git commit -m "Round results: team-event rounds (IEC) show classes/teams only

When a round has TeamResult rows (hasTeamData), the round results page now:
- defaults to the Teams tab
- hides the driver-centric tabs (Combined, Quali, Race 1/2, Pro/Am, Team, By Car)
- renders RoundTeamSection (class-grouped team standings with each team's
  participating drivers embedded)
- suppresses the driver podium

Mirrors the standings page behaviour where isTeamEventSeason collapses all
tabs to the team view. Other leagues are unaffected." || true
git push

echo "Done. IEC round pages now show only the class/team view."
