#!/usr/bin/env bash
# Deploy: hide the redundant Pro/Am column on the roster when the
# season's car classes are themselves Pro/Am tiers (every CarClass
# shortCode is PRO or AM). For real multi-class leagues (LMP2 / GTP /
# GT3 etc. with a Pro/Am tier on top) both columns stay visible.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_hide_proam_when_class.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_hide_proam_when_class.sh
git commit -m "Roster: hide redundant Pro/Am column on Pro/Am-class leagues

Detect: if every CarClass shortCode in the season is in {PRO, AM},
the Class column already shows Pro/Am — Registration.proAmClass is
redundant. Hide the Pro/Am column on those rosters. For real multi-
class leagues (IEC etc.), nothing changes." || true
git push

echo "Done."
