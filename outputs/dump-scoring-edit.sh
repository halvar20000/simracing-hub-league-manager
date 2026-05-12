#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/app/admin/scoring-systems/[id]/edit/page.tsx ==="
cat 'src/app/admin/scoring-systems/[id]/edit/page.tsx'

echo ""
echo "=== src/lib/actions/scoring-systems.ts (or similar) ==="
for f in src/lib/actions/scoring-systems.ts src/lib/actions/scoring.ts src/lib/actions/scoring-system.ts; do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    cat "$f"
  fi
done

echo ""
echo "=== Where ScoringSystem is loaded for the round page ==="
grep -rn --include='*.tsx' --include='*.ts' "scoringSystem.*include\|scoringSystem:" src/app/leagues 2>/dev/null | head -20
