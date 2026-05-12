#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== Lines 180-235 of standings.ts ==="
sed -n '180,235p' src/lib/standings.ts
echo ""
echo "=== All rCorrection / correctionPoints references ==="
grep -n 'rCorrection\|correctionPoints' src/lib/standings.ts
echo ""
echo "=== Latest commit ==="
git log -2 --oneline
