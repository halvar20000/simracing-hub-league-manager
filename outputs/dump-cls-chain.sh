#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
PG='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== Lines 155–180 (cls assignment chain) ==="
sed -n '155,180p' "$PG"
