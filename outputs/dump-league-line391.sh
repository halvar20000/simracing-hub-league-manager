#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PG='src/app/leagues/[slug]/page.tsx'

echo "=== Lines 200-260 (recentPodiums.map block) ==="
sed -n '200,260p' "$PG"
echo ""
echo "=== Lines 380-400 (likely closing) ==="
sed -n '380,400p' "$PG"
echo ""
echo "=== Lines 80-120 (recentPodiums computation) ==="
sed -n '80,120p' "$PG"
