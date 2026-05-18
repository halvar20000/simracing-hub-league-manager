#!/usr/bin/env bash
# Deploy: add a "+ New scoring system" button on
# /admin/scoring-systems and a creation page at
# /admin/scoring-systems/new with two fields:
#   - Name (required, unique)
#   - Copy from (optional dropdown of existing systems)
#
# Choosing "Copy from" duplicates every field (points table, bonuses,
# participation rule, FPR config, protest window, races-per-round
# tables, etc.) from the source. Leaving it on "Create blank" makes a
# minimal new system you can fully customise on the edit page.
#
# After creation you're redirected to the edit page for the new
# system. The unique constraint on `name` is pre-checked so collisions
# show a friendly error rather than a Prisma stack.
#
# Pure server-action + UI change, no DB / schema migration.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_new_scoring_system.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/lib/actions/scoring-systems.ts \
  "src/app/admin/scoring-systems/page.tsx" \
  "src/app/admin/scoring-systems/new/page.tsx" \
  outputs/run_deploy_new_scoring_system.sh
git commit -m "Scoring systems: create + copy-from-existing flow

* New server action createScoringSystem(formData) — validates name,
  pre-checks uniqueness, and either creates blank or copies every
  field from a source system except id + name.
* New page /admin/scoring-systems/new with name input and
  'Copy from' <select> of existing systems (showing how many seasons
  each one is used in for context).
* '+ New scoring system' button on the admin list page header.

After creation the admin lands on the edit page for the new system." || true
git push

echo "Done."
