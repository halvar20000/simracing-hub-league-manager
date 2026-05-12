#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

ROUND_ADMIN='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== Admin round detail page (top 100 lines + import-related sections) ==="
if [ -f "$ROUND_ADMIN" ]; then
  head -120 "$ROUND_ADMIN"
  echo ""
  echo "--- All references to import / csv / IRLM / json in admin round page ---"
  grep -n -E "(import|csv|irlm|IRLM|json|JSON)" "$ROUND_ADMIN" | head -40
else
  echo "(no admin round page)"
fi

echo ""
echo "=== Files with iracing/iRacing JSON or import-related names ==="
find src -type f \( -name '*irlm*' -o -name '*iracing*' -o -name '*csv-import*' -o -name '*import*' \) -not -path '*/node_modules/*' 2>/dev/null

echo ""
echo "=== importRow signature in irlm-import.ts ==="
if [ -f src/lib/actions/irlm-import.ts ]; then
  grep -n -A 6 "function importRow\|export async function" src/lib/actions/irlm-import.ts | head -40
fi

echo ""
echo "=== Existing CSV import action (if any) ==="
for f in src/lib/actions/csv-import.ts src/lib/actions/results-csv.ts; do
  if [ -f "$f" ]; then
    echo "--- $f (first 80 lines) ---"
    head -80 "$f"
  fi
done

echo ""
echo "=== Are there any sample iRacing JSON files in the repo? ==="
find . -name '*.json' -not -path './node_modules/*' -not -path './.next/*' 2>/dev/null | head -10
