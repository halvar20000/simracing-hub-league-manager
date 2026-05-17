#!/usr/bin/env bash
# Tweak: widen the Car column on the admin roster so the chosen car name
# is fully visible, and tighten neighbouring columns (iR ID, #, Class,
# Pro/Am, Status, Fee, Invite, Accepted) to compensate. Rename "iRacing
# ID" header to "iR ID" so it fits without wrapping.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_car_width.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/components/RegistrationCarSelect.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_roster_car_width.sh
git commit -m "Roster: widen Car column, tighten neighbours

- RegistrationCarSelect: drop max-w-[16rem]; use block w-full
  min-w-[14rem] so the selected option is fully visible.
- Roster table: shrink px-4 to px-2/3 on iR ID, #, Class, Pro/Am,
  Status, Fee, Invite, Accepted; whitespace-nowrap on iR ID; add
  min-w-[15rem] on the Car th + td; rename 'iRacing ID' to 'iR ID'
  to save horizontal space." || true
git push

echo "Done."
