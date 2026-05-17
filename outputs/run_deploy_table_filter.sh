#!/usr/bin/env bash
# Deploy: instant client-side search on admin tables.
#
# Adds <TableFilter /> — a tiny client component with a search box that
# hides table rows whose data-filter attribute doesn't contain the query
# (case-insensitive). Implementation is a 1-line <style> tag, so zero
# DOM mutation and React never fights it.
#
# Applied to:
#   - Roster page (both solo and team variants) — search by driver name,
#     iRacing ID, team, car, etc.
#   - Pro/Am eligible table.
#
# Drop into any other admin table by adding TableFilter + data-filter on
# each <tr>.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_table_filter.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/components/TableFilter.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/pro-am/page.tsx" \
  outputs/run_deploy_table_filter.sh
git commit -m "Admin: reusable TableFilter (instant client-side search)

New <TableFilter tableId=...> client component renders a search input
plus a single <style> tag that hides <tr data-filter='...'> rows whose
attribute doesn't contain the query (case-insensitive via CSS [i]).
Zero state, no DOM mutation, no JS animation — pure declarative.

Applied to the roster page (solo + team modes) and the Pro/Am eligible
table. Each row carries a normalised data-filter built from the
driver's first/last/name + iRacing ID + email + team + car + class +
status, so a single search box covers every visible column." || true
git push

echo "Done. Try typing 'platzer' on the roster page."
