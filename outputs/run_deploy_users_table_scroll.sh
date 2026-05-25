#!/usr/bin/env bash
# Deploy: fix horizontal scrolling on the admin Users page (/admin/users).
#
# The table wrapper used `overflow-hidden`, which clipped the columns past
# the right edge. Changed to `overflow-x-auto` and gave the table a
# `min-w-[1100px]` so columns stay readable and the wrapper scrolls.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_users_table_scroll.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/app/admin/users/page.tsx \
  outputs/run_deploy_users_table_scroll.sh
git commit -m "Admin users page: fix clipped columns, allow horizontal scroll

The table wrapper used overflow-hidden, so the right-most columns
(Synced, Role, Joined, Set role) were clipped off-screen with no way
to reach them. Switched to overflow-x-auto and gave the table a
min-width so columns stay legible and the wrapper scrolls instead." || true
git push

echo "Done."
