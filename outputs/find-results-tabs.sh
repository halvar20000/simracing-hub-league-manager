#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Files mentioning Combined / Pro / AM / By car / byCar ==="
grep -rln -E 'Combined|"Pro"|"AM"|By car|byCar' src/app/leagues 2>/dev/null | sort -u

echo ""
echo "=== 2. Show the tab/nav bar in each candidate (head 80 lines) ==="
for F in $(grep -rln -E 'Combined.*Pro|byCar|tab=' src/app/leagues 2>/dev/null | sort -u); do
  echo ""
  echo "-- $F (lines: $(wc -l < "$F")) --"
  head -80 "$F"
  echo "------------------------------------------------------------"
done

echo ""
echo "=== 3. Any reusable component with these tab labels? ==="
grep -rln -E '"Combined"|"Pro"|"AM"|byCar' src/components 2>/dev/null || echo "  (none in src/components)"

echo ""
echo "=== 4. All page.tsx files under leagues/ for reference ==="
find src/app/leagues -name page.tsx -type f 2>/dev/null | sort
