#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Top-level files in public/ ==="
ls -la public/ 2>/dev/null || echo "(no public folder)"

echo ""
echo "=== Logo / brand references in src/ and app/ ==="
grep -rn 'logo\|simracing-hub\|brand\|<header' src/ app/ 2>/dev/null | grep -v node_modules | grep -v .next | head -30 || true

echo ""
echo "=== Top-level layout files ==="
find src/app -maxdepth 2 -name 'layout.tsx' -type f 2>/dev/null
echo ""
echo "=== src/app/layout.tsx (root layout) ==="
if [ -f src/app/layout.tsx ]; then
  cat src/app/layout.tsx
fi

echo ""
echo "=== Look for header components ==="
find src/components -name '*.tsx' -type f 2>/dev/null | xargs grep -l 'logo\|<header\|brand' 2>/dev/null | head -5 || true
