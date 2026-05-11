#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. penalty-pool/page.tsx (middle, lines 80–260) ==="
sed -n '80,260p' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'

echo ""
echo "=== 2. admin-reports.ts (full) ==="
cat src/lib/actions/admin-reports.ts

echo ""
echo "=== 3. rounds.ts (full) ==="
cat src/lib/actions/rounds.ts
