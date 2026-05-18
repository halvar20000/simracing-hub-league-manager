#!/usr/bin/env bash
# Deploy: extend the scoring-system points-table editor from 30 to 40
# positions. Touches both the form generator (MAX_POS) and the server
# action's input parser (which previously stopped reading at position
# 30 even if the form sent more).
#
# Existing systems keep their values — they only have entries for
# positions 1..N where they need them, and the schema stores the
# table as JSON, so widening the form just adds 10 more editable rows.
#
# Pure UI + parser change, no DB / schema migration.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_max_pos_40.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/admin/scoring-systems/[id]/edit/page.tsx" \
  src/lib/actions/scoring-systems.ts \
  outputs/run_deploy_max_pos_40.sh
git commit -m "Scoring systems: support points for positions 1-40 (was 1-30)

The edit form generates one row per position from a single MAX_POS
constant (bumped 30 → 40). The corresponding readPointsTable() calls
in the server action also lift their maxPos arg to 40, otherwise the
extra positions submitted from the form would be silently dropped.

Applies to the main pointsTable, the race-2 split, and the
classPointsTable." || true
git push

echo "Done."
