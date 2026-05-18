#!/usr/bin/env bash
# Deploy: surface the existing deleteRound() server action in the
# admin Edit Round page UI. Same pattern as DeleteSeasonButton:
# Danger zone <details> at the bottom of the edit form, type-the-label
# confirmation before the destructive button activates.
#
# Cascades cover everything else: race results, team results, CSV
# imports, incident reports + decisions + comments + evidence, FPR
# awards, penalties, RSVPs (and any cached Discord RSVP message),
# stream announcement.
#
# No DB / schema changes.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_delete_round_ui.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  src/components/DeleteRoundButton.tsx \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit/page.tsx" \
  outputs/run_deploy_delete_round_ui.sh
git commit -m "Admin round: Danger zone with delete-round button

deleteRound server action existed but had no UI. New DeleteRoundButton
component (mirrors DeleteSeasonButton with type-the-label confirmation,
e.g. 'R5 — Spa-Francorchamps') wired into a Danger zone <details>
block at the bottom of the round edit page.

The confirmation panel lists what cascades: race results, incident
reports (with decisions/comments/evidence), RSVPs, penalties + FPR
awards. The Edit Round query now includes _count for those tables so
the admin can see exactly what's about to be lost." || true
git push

echo "Done."
