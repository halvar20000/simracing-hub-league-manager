#!/usr/bin/env bash
# Deploy: freeze the first (Driver) column on the solo-mode admin
# roster so it stays visible while scrolling the table horizontally.
#
# Pure CSS via a scoped <style> block targeting #rosterTable:
#   - position: sticky; left: 0 on header + body first-child cells
#   - opaque background colours so content doesn't bleed through
#     (sticky cells need their own bg — the thead bg doesn't paint
#     behind them at the scroll boundary)
#   - body cell bg switches to zinc-900 on row hover via a CSS hover
#     rule (no need to add `group` to every <tr>)
#
# The injected filter row from SortableTableEnhancer lives inside
# <thead> so its first cell picks up the same rule automatically.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_roster_sticky_col.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx" \
  outputs/run_deploy_roster_sticky_col.sh
git commit -m "Admin roster (solo): freeze first (Driver) column on horizontal scroll

CSS-only via a scoped <style> block on #rosterTable:
* position: sticky; left: 0 on header + body first-child cells
* opaque backgrounds (zinc-900 for header, zinc-950 for body) so
  scrolling content doesn't bleed through — sticky cells need their
  own bg because the thead's bg-zinc-900 doesn't paint behind them
  at the scroll boundary
* hover row matches its sticky cell's bg too

Works automatically for the filter row injected by
SortableTableEnhancer (it's in <thead>, so its first <th> picks up
the same rule)." || true
git push

echo "Done."
