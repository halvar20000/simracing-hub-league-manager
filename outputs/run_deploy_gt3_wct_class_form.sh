#!/usr/bin/env bash
# Deploy: tweak the "Add a car class" form on GT3 WCT's manage-cars page.
#   - Heading becomes "Add class (PRO, AM)"
#   - Placeholders are "PRO" instead of "GT4"
#   - iRacing class id(s) input hidden (irrelevant for Pro/Am splits)
# Other leagues (IEC, SFL, etc.) keep the original GT4 example.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_gt3_wct_class_form.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_gt3_wct_class_form.sh
git commit -m "Admin cars: rename to 'Add class (PRO, AM)' on GT3 WCT

GT3 WCT uses Pro/Am splits, not real car classes. Show 'Add class
(PRO, AM)' as the heading, 'PRO' as the placeholder, and hide the
iRacing class id(s) field on this league only. Other leagues still
see 'Add a car class' with the GT4 example." || true
git push

echo "Done."
