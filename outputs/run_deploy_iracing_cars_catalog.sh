#!/usr/bin/env bash
# Deploy: /admin/iracing/cars — same model as /admin/iracing/tracks but
# for iRacing cars.
#
# Schema (additive):
#  - New IracingCar model (iracingCarId @id, name, category, freeContent,
#    cachedAt).
#
# Data:
#  - NEW: src/data/iracing-cars.json — 14 confirmed real iRacing car IDs
#    extracted from your past event-result JSON imports, plus a handful
#    of best-effort entries with synthetic IDs (99001+) for cars where
#    the real ID isn't known yet. Each row has name + category.
#
# Server actions:
#  - refreshIracingCars     — seed from JSON (upsert keyed on
#    iracingCarId). Idempotent, safe to run repeatedly.
#  - addIracingCarManually  — allocate a synthetic ID at 100001+ for
#    a hand-added car.
#  - deleteIracingCar       — remove a row.
#
# Admin page /admin/iracing/cars:
#  - Stats (count, last update) + "Seed from JSON" button.
#  - "Add a car" form with category dropdown.
#  - Full table with TableFilter search, per-row badges:
#      * 'iRacing ID' (green)    — real iRacing car ID (< 99001)
#      * 'best-effort' (amber)   — synthetic seed ID (99001-99999)
#      * 'manual' (cyan)         — admin-added (≥ 100001)
#  - Per-row Delete button.
#
# Plus a new nav chip on the admin dashboard: "iRacing cars".
#
# Network: prisma db push talks to Neon on 5432 — use phone hotspot.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_iracing_cars_catalog.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/4  prisma db push (additive: IracingCar model)"
npx prisma db push

echo "==> 2/4  prisma generate"
npx prisma generate

echo "==> 3/4  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 4/4  Commit + push (Vercel auto-deploys main)"
git add \
  prisma/schema.prisma \
  src/data/iracing-cars.json \
  src/lib/actions/iracing-cars.ts \
  "src/app/admin/iracing/cars/page.tsx" \
  src/app/admin/page.tsx \
  outputs/run_deploy_iracing_cars_catalog.sh
git commit -m "iRacing cars: admin catalogue page (mirrors tracks page)

Adds IracingCar model + /admin/iracing/cars page following the exact
same shape as the IracingTrack one. Catalogue is seeded from
src/data/iracing-cars.json: 14 confirmed real iRacing car IDs
extracted from past event-result imports (132 BMW M4 GT3 EVO, 173
Ferrari 296 GT3, etc.), plus best-effort entries for GTP / GT4 / LMP3
/ Open Wheel cars whose real IDs aren't known yet (synthetic 99001+).

Server actions: refreshIracingCars (seed), addIracingCarManually
(synthetic 100001+ for hand-adds), deleteIracingCar.

Admin page has the same UX as /admin/iracing/tracks — stats, seed
button, manual-add form, full filterable table with per-row source
badges (iRacing ID / best-effort / manual) and Delete button.

Nav chip added to the admin dashboard next to 'iRacing tracks'." || true
git push

echo "Done."
echo
echo "Next: visit /admin/iracing/cars and click 'Seed from JSON' to"
echo "populate the cache. Then extend it via the form whenever iRacing"
echo "releases new cars."
