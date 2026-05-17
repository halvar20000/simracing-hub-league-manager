#!/usr/bin/env bash
# Deploy: clarify the Manage Cars UI so admins know they don't need to add
# cars to each driver class once shared cars are defined.
#
# Changes on /admin/leagues/[slug]/seasons/[seasonId]/cars:
#  - Intro paragraph now tells admins that most leagues only need the
#    Shared cars list.
#  - When a class has no class-pinned cars AND the season has shared cars,
#    the empty-state shows a green note: "Drivers in <Class> can already
#    pick any of the N shared cars above — no need to add them again."
#  - The big per-class "Add cars" textarea is collapsed behind a small
#    "Advanced: add a car that belongs only to <Class>" details element,
#    so the obvious workflow is shared-cars-only.
#
# No DB or schema changes — pure UI.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_cars_ui_clarify.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_cars_ui_clarify.sh
git commit -m "Cars admin: make 'shared cars cover this class' obvious

When the season has shared (carClassId NULL) cars defined, the per-class
'Add cars' textarea was still rendered prominently — which made it look
like admins still had to re-add the cars under PRO / AM. They don't.

- Intro paragraph now tells admins shared cars are the normal path.
- Each class with no class-pinned cars shows a green note explaining
  drivers can already pick any of the N shared cars.
- The per-class add form is hidden behind a small 'Advanced: add a car
  that belongs only to <Class>' details toggle, for the rare case of a
  BoP-restricted variant." || true
git push

echo "Done."
