#!/usr/bin/env bash
# Deploy: bulk-add rounds. Paste a full season schedule into a textarea
# and create all rounds in one shot.
#
# - New server action: bulkCreateRounds in src/lib/actions/rounds.ts
# - New page: /admin/leagues/[slug]/seasons/[seasonId]/rounds/bulk
# - "Bulk add…" link added next to "+ Add Round" on the admin season page
#
# Input format (auto-detected per line: TAB / pipe / comma):
#   Name | Track | Config | Start (YYYY-MM-DD HH:MM) | Race length | Counts?
#
# - Name is optional (auto-filled "Round N — Track" when blank)
# - Track and Start are required
# - Counts defaults to true; accepts y/yes/true/1 / n/no/false/0
# - Round numbers auto-increment from the current highest
# - Lines starting with # are ignored (use for column comments)
# - All rows validated first; any error → nothing is created
# - Whole batch in a Prisma transaction (atomic)
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_bulk_rounds.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push (Vercel auto-deploys main)"
git add \
  src/lib/actions/rounds.ts \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/bulk/page.tsx" \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx" \
  outputs/run_deploy_bulk_rounds.sh
git commit -m "Rounds: bulk-add via textarea

Adds a 'Bulk add…' link next to '+ Add Round' on the admin season page,
opening a new /rounds/bulk page with a textarea + format help.

Server action bulkCreateRounds parses each line (TAB/pipe/comma auto-
detected), validates everything first, then creates all rounds in a
single Prisma transaction so a mid-list failure rolls everything back.

Round numbers auto-increment from the current highest, so it's safe to
use repeatedly (e.g. paste the first half now, the second half later).
Counts-for-championship and race length are optional with sane defaults." || true
git push

echo "Done."
