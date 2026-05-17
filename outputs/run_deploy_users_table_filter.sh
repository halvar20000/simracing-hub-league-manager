#!/usr/bin/env bash
# Deploy: TableFilter on the admin Users page (/admin/users).
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_users_table_filter.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/app/admin/users/page.tsx \
  outputs/run_deploy_users_table_filter.sh
git commit -m "Admin users page: add TableFilter search box

Row data-filter built from firstName, lastName, name, email,
iracingMemberId, and role. Search matches any substring across all of
them." || true
git push

echo "Done."
