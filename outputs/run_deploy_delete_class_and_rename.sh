#!/usr/bin/env bash
# Deploy:
#  1. Rename the GT3 WCT class form heading from "Add class (PRO, AM)" to
#     "Add driver class (PRO, AM)".
#  2. Move the delete-class button into a "Danger zone" expander so it's
#     always reachable (used to require zero cars to appear). The button is
#     disabled when the class has registrations or race results — the
#     server action already refuses in that case.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_delete_class_and_rename.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/cars/page.tsx" \
  outputs/run_deploy_delete_class_and_rename.sh
git commit -m "Admin cars: rename to 'Add driver class' + always reachable delete

- GT3 WCT heading: 'Add class (PRO, AM)' -> 'Add driver class (PRO, AM)'.
- Delete-class button: move into a 'Danger zone' <details> expander and
  drop the 'cars === 0' gate. The button is disabled when the class has
  registrations or team results (the server action already refuses in
  that case), with an inline hint telling the admin what to clear." || true
git push

echo "Done."
