#!/usr/bin/env bash
# Deploy: "Pick from iRacing catalogue" multi-select on the Manage
# Driver Class and Cars page.
#
# What's new:
#  - Server action addCarsFromCatalog(formData) in src/lib/actions/cars.ts.
#    Reads `seasonId`, optional `carClassId`, and repeated
#    `iracingCarIds` (from checkboxes); looks each one up in the
#    IracingCar table and creates Car rows in the season with both
#    name + iracingCarId set. Dedupes by name (case + accent-
#    insensitive via normaliseCarName) — re-running the same
#    selection is harmless.
#  - New section on /admin/leagues/[slug]/seasons/[seasonId]/cars:
#    'Pick from iRacing catalogue (XXX cars cached)'. Drop-down
#    chooses 'Shared (any class)' or any defined driver class. List
#    is grouped by category (GT3 / GT4 / LMP2 / GTP / Oval / Open
#    Wheel / Stock Car / Dirt / Touring / etc.), each car a check-
#    box with the car name + iRacing ID. Cars already added to this
#    season are pre-ticked and disabled so you can't add them twice.
#    The whole list lives inside a <details> so it doesn't dominate
#    the page on first load.
#  - Empty-catalogue case shows a helpful note linking to
#    /admin/iracing/cars where the catalogue is seeded.
#
# Use case: setting up a new NASCAR / Stock Car / Oval league —
# instead of typing 'NASCAR Cup Series Chevrolet Camaro ZL1' etc.
# from memory, scroll the Oval category and tick the cars you want.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_pick_cars_from_catalog.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/actions/cars.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_pick_cars_from_catalog.sh
git commit -m "Manage Cars: 'Pick from iRacing catalogue' multi-select

* New server action addCarsFromCatalog reads checkbox values
  (iracingCarIds[]) and looks each one up in the IracingCar table to
  create Car rows in the season. Sets both name and iracingCarId so
  future iRacing-JSON imports match directly. Dedupes by
  normaliseCarName so accidental re-submits are harmless.
* New section on the Manage Cars page above 'Shared cars': a
  category-grouped checkbox list inside a <details>. Drop-down picks
  'Shared (any class)' or a specific driver class as the target.
* Cars already in the season are pre-ticked + disabled so the admin
  sees what's already configured.
* Empty-catalogue case nudges the admin to seed at
  /admin/iracing/cars first." || true
git push

echo "Done."
