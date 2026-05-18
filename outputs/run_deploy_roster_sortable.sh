#!/usr/bin/env bash
# Deploy: Excel-like sort + per-column filter on the solo-mode admin
# roster table.
#
# Architecture:
#  - New client component src/components/SortableTableEnhancer.tsx
#    enhances a server-rendered <table> in place after mount:
#      * Reads <th data-col="X"> to find sortable columns.
#      * Adds an extra <thead> row with a small filter <input> under
#        each sortable header.
#      * Click a header → cycles asc / desc / none with ▲ / ▼ orange
#        indicator. The component reorders <tr> children of <tbody>
#        directly in the DOM, so cells with inline server-action forms
#        (car dropdown, Approve / Reject) stay bound — only the rows'
#        position changes.
#      * Per-column filter input → substring match against
#        data-r-<col> on each <tr>. Hidden rows get a .cw-col-hidden
#        class. CSS uses !important so it wins against the existing
#        global TableFilter's attribute-selector hide. Both filters
#        compose: a row is visible only if neither hides it.
#
#  - Admin roster page (solo mode only — team mode keeps its grouping)
#    now has data-col on each sortable <th> and data-r-<key>="<value>"
#    on each <tr>. The existing global TableFilter stays at the top
#    for cross-column quick search.
#
# Sort key choices:
#  - name → "First Last" lowercased
#  - irid, num → numeric (numeric detector in the enhancer kicks in)
#  - team, class, car, proam → lowercased name
#  - status, fee, invsent, invaccepted → lowercased enum value
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_sortable.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/components/SortableTableEnhancer.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_roster_sortable.sh
git commit -m "Admin roster (solo): Excel-like sort + per-column filter

New SortableTableEnhancer client component reads data-col on <th>s
and data-r-<key> attributes on <tr>s; on mount it injects a filter
row into <thead> and makes each marked header clickable to sort
(asc / desc / none with ▲ / ▼ indicator). Sort reorders <tr>
children in place — inline forms (car dropdown, Approve/Reject) stay
bound.

Per-column filters compose with the existing global TableFilter via
a .cw-col-hidden !important class; both apply (AND).

Solo-mode admin roster now has data-col + data-r-<key> on every
sortable column: Driver, iR ID, #, Team, Class, Car, Pro/Am (when
shown), Status, Fee (when shown), Invite, Accepted.

Team-mode roster left alone — sorting would break the team grouping;
the global TableFilter is enough there." || true
git push

echo "Done."
