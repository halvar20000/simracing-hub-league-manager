#!/usr/bin/env bash
# Deploy: car-name dedup is now accent-insensitive.
#
# Before: "Huracan" and "Huracán" compared as different names. Copy from
# previous season (and bulk add) would happily create two Car rows.
#
# After: a normaliseCarName helper applies NFD + strip combining marks +
# lowercase + collapse whitespace, used everywhere we dedupe car names:
#  - copyClassesAndCarsFromPreviousSeason (existing-dest lookup, source
#    bucketing by name, shared-cars copy)
#  - addCarsBulk for shared cars
#
# The original display name is preserved on the Car row — only the lookup
# key is normalised.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_accent_safe_car_dedupe.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/cars.ts \
  outputs/run_deploy_accent_safe_car_dedupe.sh
git commit -m "Cars dedup: accent / case / whitespace insensitive

normaliseCarName(name) = NFD → strip combining marks → lowercase →
trim → collapse whitespace. Used as the comparison key in:

* copyClassesAndCarsFromPreviousSeason — source bucketing AND
  existing-destination lookups (haveSharedInDest / havePinnedInDest).
* Shared-cars second-pass copy.
* addCarsBulk shared-cars branch — finds the existing row regardless of
  accents and either backfills iracingCarId or skips.

So 'Lamborghini Huracán GT3 EVO' and 'Lamborghini Huracan GT3 EVO' are
treated as the same car. The display name on the existing row is kept
untouched." || true
git push

echo "Done."
