#!/usr/bin/env bash
# Deploy: extend the redundant-Pro/Am-column hide logic (already on the
# on-screen admin roster) to the CSV export and print/PDF view.
#
# Rule (same in all three places): when every CarClass shortCode in
# the season is in {PRO, AM} — i.e. the Class column already shows the
# Pro/Am tier — the dedicated Pro/Am column is skipped because it would
# just repeat the value. For real multi-class leagues (IEC: LMP2 / GTP
# / GT3 / GT4) both columns stay because they carry distinct info.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_export_proam_hide.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/export/route.ts" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/print/page.tsx" \
  outputs/run_deploy_roster_export_proam_hide.sh
git commit -m "Roster export: hide redundant Pro/Am column on Pro/Am-class leagues

Mirror the on-screen admin roster's proAmIsClass detection in the CSV
download and the print/PDF view. When every CarClass shortCode is in
{PRO, AM} the Class column already shows the Pro/Am tier, so the
Pro/Am column is dropped from both exports. For IEC and similar
multi-class leagues both columns stay." || true
git push

echo "Done."
