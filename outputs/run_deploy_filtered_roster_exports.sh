#!/usr/bin/env bash
# Deploy: make the CSV + PDF export buttons respect the currently
# active filter / sort on the roster pages.
#
# Approach: switch from anchor-to-server-route to a client component
# (FilteredRosterButtons) that:
#
#   - For CSV: walks the table DOM, skips any <tr> with computed
#     display: none (i.e. hidden by the global TableFilter or by the
#     SortableTableEnhancer's per-column filters), reads data-r-<col>
#     attributes for each <th data-col>, and triggers a Blob download.
#   - For PDF: just window.print() on the current page. The roster
#     pages now have an @media print block that hides chrome (back
#     link, page header, filter inputs, sort indicators) and switches
#     the table to a light theme — and because hidden rows already
#     have display:none, the print includes only visible rows. The
#     existing server-side /roster/print page remains for users who
#     bookmark that URL directly.
#
# Data attributes updated to display-quality strings (mixed case names,
# "Sent"/"Not sent"/"Pending" enum labels). SortableTableEnhancer
# already lowercases both sides when filtering / sorting, so case-
# insensitive matching still works the same.
#
# Admin solo roster also exposes data-email on each <tr> so the
# FilteredRosterButtons emits an Email column in admin CSV (passed via
# extraColumns prop). Public roster does NOT expose email.
#
# Scope: solo-mode tables on both admin + public. Team-mode rosters
# keep the existing server-side anchor export buttons (sorting would
# break the team grouping; client-side filtered exports rely on
# data-r-<col> rows which team mode doesn't render).
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_filtered_roster_exports.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/components/FilteredRosterButtons.tsx \
  src/components/TableFilter.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  "src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_filtered_roster_exports.sh
git commit -m "Roster: CSV / PDF exports now respect on-screen filters

New client component FilteredRosterButtons replaces the server-route
anchor buttons on solo-mode admin + public rosters:

* CSV: reads visible (display != 'none') <tbody> rows from the table,
  pulls data-r-<col> for each <th data-col> in DOM order, builds the
  CSV in JS and triggers a Blob download. Admin gets an extra Email
  column via extraColumns + data-email on rows.
* PDF: window.print() on the current page. Print CSS hides chrome
  (back link, page header, filter inputs, sort indicators, the
  TableFilter search box marked no-print) and switches the table to
  a light theme. Filtered rows already have display:none so they're
  naturally excluded from the print.

Type 'Pro' in a per-column filter → Download CSV / Save as PDF only
includes the Pro drivers. Same for the global search box.

Team-mode rosters keep the existing server-route anchor buttons
(sorting/filtering aren't enabled there; they would break the team
grouping)." || true
git push

echo "Done."
