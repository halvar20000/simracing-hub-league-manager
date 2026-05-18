#!/usr/bin/env bash
# Deploy: roster export buttons on the admin roster page.
#
# Two new entry points:
#
#  - GET /admin/leagues/[slug]/seasons/[seasonId]/roster/export
#      Streams a CSV download. UTF-8 BOM prepended so Excel handles
#      umlauts / accents correctly. Columns match the on-screen
#      roster — team column only present in team-registration seasons,
#      Pro/Am column only when proAmEnabled. Filename is
#      roster-<slug>-<season>-<year>.csv.
#
#  - GET /admin/leagues/[slug]/seasons/[seasonId]/roster/print
#      Light-theme printable page. @media print CSS strips chrome and
#      gives A4 portrait margins. Has a 'Print / Save as PDF' button
#      that calls window.print(). User picks 'Save as PDF' in the
#      browser's print dialog. For team seasons the table is grouped
#      by team with section headers.
#
# Two new components: src/components/PrintTrigger.tsx (tiny client
# component just to call window.print()), and a private
# RosterExportButtons in the roster page itself.
#
# No DB / schema changes, no new dependencies.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_export.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/export/route.ts" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/print/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  src/components/PrintTrigger.tsx \
  outputs/run_deploy_roster_export.sh
git commit -m "Admin roster: Download CSV + Print/Save as PDF buttons

* New GET route .../roster/export returns a CSV with UTF-8 BOM so
  Excel renders ü / ö / ä / accented chars correctly. Columns mirror
  the on-screen table (team col only for team-mode seasons, Pro/Am
  col only when proAmEnabled).
* New page .../roster/print renders a printable light-theme view
  with @media print CSS (A4 portrait, headers repeat across pages,
  rows don't break). Includes a small client-component button that
  fires window.print() for one-click PDF saves.
* Two buttons on the admin roster page header (both team-mode and
  solo-mode branches): 'Download CSV' (direct anchor with browser
  download) and 'Print / Save as PDF' (opens print view in a new
  tab)." || true
git push

echo "Done."
