#!/usr/bin/env bash
# Deploy: rename "Manage cars" to "Manage Driver Class and Cars" on the
# admin season page link and on the linked page's H1.
#
# Pure copy change. No DB / schema.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_rename_manage_cars.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_rename_manage_cars.sh
git commit -m "Admin season: rename 'Manage cars' → 'Manage Driver Class and Cars'

Updated both the link button on the season detail page and the H1 on
the linked /cars page so the wording matches what the page actually
covers (driver classes + cars)." || true
git push

echo "Done."
