#!/usr/bin/env bash
# Deploy: surface the existing deleteSeason() server action in the
# admin season page UI. Mirrors the DeleteLeagueButton pattern: a
# "Danger zone" <details> at the bottom of /admin/leagues/[slug]/seasons/
# [seasonId] with a type-the-name confirmation before the destructive
# button activates.
#
# The deleteSeason server action already existed — it just had no UI.
# Schema cascades take care of: rounds, race results, team results,
# RSVPs, registrations, teams, car classes, cars, incident reports,
# penalties, FPR awards, etc.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_delete_season_ui.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/components/DeleteSeasonButton.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx" \
  outputs/run_deploy_delete_season_ui.sh
git commit -m "Admin season: Danger zone with delete-season button

The deleteSeason server action existed but had no UI. Adds a
DeleteSeasonButton client component (mirrors DeleteLeagueButton with
type-the-name confirmation) and wires it into a 'Danger zone' details
block at the bottom of the admin season page.

The confirmation panel lists what will be deleted: rounds (with their
race results, incidents, decisions, RSVPs, penalties), registrations
+ teams, and car classes / cars defined under the season. All of
those cascade automatically via existing schema FKs." || true
git push

echo "Done."
