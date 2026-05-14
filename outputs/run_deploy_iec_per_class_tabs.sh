#!/usr/bin/env bash
# Deploy: IEC round page now has one tab per car class. Each tab shows the
# team race results (RoundTeamSection scoped to that class) on top and a
# team-qualifying table (best lap across the team's drivers) below.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iec_per_class_tabs.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_iec_per_class_tabs.sh
git commit -m "Round results: per-class tabs for team-event rounds (IEC)

On team-event rounds (hasTeamData), the round results page now shows one
tab per car class instead of a single 'Teams' tab. Each class tab
renders:
  - Race results: RoundTeamSection filtered to that class
  - Below: team qualifying — best lap by team across all its drivers,
    sorted ascending, with class-pole gap
The cls URL param holds the carClass shortCode in team mode (e.g. ?cls=GTP).
Non-team-event rounds are unaffected." || true
git push

echo "Done. IEC round pages now have per-class tabs with race + quali sections."
