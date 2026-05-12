#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PG='src/app/leagues/[slug]/seasons/[seasonId]/page.tsx'
echo "=== Full season page (it's not too long) ==="
wc -l "$PG"
echo ""
sed -n '1,400p' "$PG"
