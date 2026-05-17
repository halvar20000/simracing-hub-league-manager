#!/usr/bin/env bash
# Deploy: make 'Copy from previous season' smart about duplicate cars.
#
# Before: every class's pinned cars were copied 1:1 to the new season. On
# GT3 WCT (PRO + AM with the same 11 cars) the new season ended up with
# 22 Car rows and the registration dropdown showed each car twice.
#
# After: when a car name appears in 2+ source classes (the PRO/AM-style
# duplicated pattern) it's promoted to a SINGLE season-wide shared car in
# the destination (carClassId NULL). A car that appears in only one
# source class stays pinned to the matching dest class — so multi-class
# leagues like IEC (LMP2-only cars, GTP-only cars, GT3-only cars, etc.)
# still get their class-specific assignments.
#
# Idempotent: re-running the copy is safe. Already-existing shared cars in
# the destination are skipped; already-existing pinned cars are skipped.
#
# No DB / schema changes — pure server-action change.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_smart_copy_cars.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/cars.ts \
  outputs/run_deploy_smart_copy_cars.sh
git commit -m "Cars copy: dedupe across classes → shared cars in destination

copyClassesAndCarsFromPreviousSeason was duplicating every PRO/AM source
car into the new season, recreating the original problem. Now:

* Bucket source cars by lowercased name across all classes.
* If a name appears in 2+ source classes → create ONE shared car
  (carClassId NULL) in the destination — drivers see it once in the
  dropdown, selectable from every class.
* If a name appears in only ONE source class → keep it pinned in the
  matching destination class. IEC LMP2 / GTP / GT3 / GT4 stays correct.
* Skip names already present as shared in the destination so re-running
  the copy is idempotent." || true
git push

echo "Done."
