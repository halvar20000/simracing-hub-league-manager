#!/usr/bin/env bash
# Deploy: add "iRacing tracks" link to the admin dashboard chip row so
# the /admin/iracing/tracks page is discoverable.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_admin_iracing_link.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/app/admin/page.tsx \
  outputs/run_deploy_admin_iracing_link.sh
git commit -m "Admin dashboard: link to /admin/iracing/tracks

The iRacing track-cache management page existed but had no nav entry —
add a chip in the admin dashboard chip row next to Scoring systems." || true
git push

echo "Done."
