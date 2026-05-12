#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PG='src/app/leagues/[slug]/page.tsx'
echo "=== $PG ==="
wc -l "$PG"
echo ""
sed -n '1,260p' "$PG"
echo "..."
echo ""
echo "=== rest of file ==="
sed -n '260,500p' "$PG"
