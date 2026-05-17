#!/usr/bin/env bash
# Deploy: inline car dropdown on the admin roster page.
# Each registration row's Car column becomes a select populated from the
# season's Car table; changing it auto-submits via a server action that
# updates Registration.carId. Works on both solo and team-mode rosters.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_car_dropdown.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/components/RegistrationCarSelect.tsx \
  src/lib/actions/admin-registrations.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_roster_car_dropdown.sh
git commit -m "Roster: inline car dropdown per driver

Each registration's Car cell becomes a select populated from the
season's Car table. On change the form auto-submits to
updateRegistrationCar (validates that the picked car belongs to the
same season as the registration, then sets Registration.carId).
Applies to both solo and team-mode rosters." || true
git push

echo "Done."
