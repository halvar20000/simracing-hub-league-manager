#!/usr/bin/env bash
# Fix: car-dropdown selection wasn't persisting (value briefly visible
# then reverted). Two changes:
#   1. updateRegistrationCar action: drop the pre-read "car must match
#      season" guard — the FK + the update already enforce correctness,
#      and the pre-check was masking real failures by throwing silently.
#      The action now does a single prisma.registration.update, so any
#      DB error surfaces visibly instead of being swallowed.
#   2. RegistrationCarSelect: add key={currentCarId} so the <select>
#      re-mounts on each save, ensuring the new defaultValue is read
#      from the freshly-revalidated server props.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_car_dropdown_persist.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/admin-registrations.ts \
  src/components/RegistrationCarSelect.tsx \
  outputs/run_deploy_car_dropdown_persist.sh
git commit -m "Roster: car dropdown now persists the selection

- Drop the pre-read season-match guard in updateRegistrationCar (it
  was silently throwing when the cars in the dropdown were stale and
  the user's pick had a different seasonId). The Prisma FK already
  enforces existence; that's enough.
- Add key={currentCarId} on the <select> so React re-mounts it after
  each save, picking up the new defaultValue from the revalidated
  server props instead of keeping a stale DOM value." || true
git push

echo "Done."
