#!/usr/bin/env bash
# Deploy: "Copy from previous season" button on the manage-cars admin
# page. One click copies every CarClass + Car from the most recent
# prior season of the same league into the current season. Idempotent:
# existing classes (by short code) and existing cars (by name) are
# skipped, so the button can be pressed multiple times safely.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_copy_classes_from_previous_season.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/cars.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_copy_classes_from_previous_season.sh
git commit -m "Admin cars: 'Copy from previous season' button

New server action copyClassesAndCarsFromPreviousSeason resolves the
most recent prior season in the same league (ordered by createdAt desc)
and copies every CarClass + Car into the current season. Duplicate
short codes and duplicate car names are skipped, so the button is
idempotent. The button only renders when a previous season exists
with at least one class." || true
git push

echo "Done."
