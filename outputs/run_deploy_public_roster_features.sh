#!/usr/bin/env bash
# Deploy: bring the public roster page up to parity with the admin one
# for the GT3 WCT / solo-mode case.
#
# What lands:
#  - NEW: /leagues/[slug]/seasons/[seasonId]/roster/export (CSV)
#         /leagues/[slug]/seasons/[seasonId]/roster/print  (printable
#         page with Print / Save-as-PDF button)
#    Both are PUBLIC routes (no admin gate) — visibility matches the
#    on-screen public roster. Email and other admin-only fields are
#    NOT included in either output.
#
#  - Solo-mode public roster:
#      * 'Download CSV' + 'Print / Save as PDF' buttons in the header
#      * Existing TableFilter (global search) + new SortableTable-
#        Enhancer (per-column click-to-sort + filter input row)
#      * Driver column moved to first position so the freeze pins on
#        the driver name
#      * Sticky first column on horizontal scroll (scoped <style> on
#        #publicRosterTable — bg-zinc-900 for header, bg-zinc-950 for
#        body, bg-zinc-900 on row hover)
#
#  - Team-mode public roster:
#      * 'Download CSV' + 'Print / Save as PDF' buttons in the header
#      * No sort / per-column filter — would break team grouping
#        (same scope as the admin team-mode roster)
#
# No new dependencies, no DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_public_roster_features.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/export/route.ts" \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/print/page.tsx" \
  outputs/run_deploy_public_roster_features.sh
git commit -m "Public roster: CSV / PDF / sort / per-column filter / sticky col

Match the admin roster features on the public-facing roster page:

* New public routes /leagues/[slug]/seasons/[seasonId]/roster/export
  and /print — same shape as the admin equivalents but with no auth
  gate. Email and admin-only fields are not exposed (mirrors what
  the on-screen public roster shows).
* Solo-mode public roster gets:
    - 'Download CSV' + 'Print / Save as PDF' header buttons
    - Existing TableFilter (global search box)
    - SortableTableEnhancer (per-column click-to-sort with ▲ / ▼
      and per-column filter inputs)
    - Driver column moved to first position so the freeze pins the
      driver name
    - Sticky first column on horizontal scroll via a scoped <style>
      on #publicRosterTable
* Team-mode public roster gets:
    - Export buttons in the header
    - Sort / per-column filter intentionally skipped — would break
      team grouping" || true
git push

echo "Done."
