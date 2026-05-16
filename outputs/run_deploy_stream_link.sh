#!/usr/bin/env bash
# Tiny follow-up: add a "Stream announcement" button to the round admin page
# so the stream upload form is discoverable.
#
# Run from your Mac terminal:
#   bash outputs/run_deploy_stream_link.sh
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> 1/2  TypeScript check"
npx tsc --noEmit -p tsconfig.json

echo "==> 2/2  Commit + push"
git add \
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx" \
  outputs/run_deploy_stream_link.sh
git commit -m "Admin round page: add 'Stream announcement' button" || true
git push

echo "Done."
