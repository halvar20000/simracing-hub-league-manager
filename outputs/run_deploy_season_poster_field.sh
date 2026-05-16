#!/usr/bin/env bash
# Deploy: add a Season poster URL field to the admin edit-season page.
# The field stores Season.scheduleImageUrl which is already used by
# SeasonHero as the page background + "Full schedule poster" link.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_season_poster_field.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/seasons.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/edit/page.tsx" \
  outputs/run_deploy_season_poster_field.sh
git commit -m "Admin: Season poster URL field on edit-season page

scheduleImageUrl is already used as the season-hero background and the
'Full schedule poster' link, but had no admin UI. Add a text/url input
on the season edit page with a small preview when the value is set;
plumb through updateSeason action. No schema change." || true
git push

echo "Done."
