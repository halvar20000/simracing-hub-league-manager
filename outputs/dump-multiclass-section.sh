#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
PG='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

echo "=== Region around the per-class rendering on standings page ==="
grep -n -E "isMulticlass|carClasses\.map|no standings to show|carClassId" "$PG" | head -40

echo ""
echo "=== Lines 190–280 (likely where the per-class block lives) ==="
sed -n '190,280p' "$PG"

echo ""
echo "=== Inspect filtering — how the per-class block selects drivers ==="
grep -n -E "filter\(.*carClass|filter\(.*cls" "$PG" | head -20

echo ""
echo "=== 'no standings to show' literal — line + context ==="
grep -n -B 2 -A 5 'no standings to show' "$PG" || echo "(not found in this page)"
