#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Looking for /logos folder ==="
for d in logos public/logos public/img public/images; do
  if [ -d "$d" ]; then
    echo ""
    echo "--- $d ---"
    ls -la "$d"
  fi
done

echo ""
echo "=== Search anywhere for CLS_League_scoring* ==="
find . -name 'CLS_League_scoring*' -not -path './node_modules/*' -not -path './.next/*' 2>/dev/null || true

echo ""
echo "=== Also looking for any *.png/svg/webp in repo root logos ==="
find . -maxdepth 3 -type f \( -iname '*league_scoring*' -o -iname '*cas-community*' -o -iname '*logo*' \) -not -path './node_modules/*' -not -path './.next/*' 2>/dev/null | head -50

echo ""
echo "=== src/components/nav.tsx ==="
cat src/components/nav.tsx

echo ""
echo "=== src/app/layout.tsx ==="
cat src/app/layout.tsx

echo ""
echo "=== package.json name + Vercel project name ==="
grep -E '"name"' package.json | head -2
