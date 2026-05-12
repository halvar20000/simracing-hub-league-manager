#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== List all files in src/app/admin (depth 2) ==="
find src/app/admin -maxdepth 3 -type f -name '*.tsx' | sort

echo ""
echo "=== /admin/page.tsx (admin home) — first 80 lines ==="
if [ -f 'src/app/admin/page.tsx' ]; then
  sed -n '1,80p' 'src/app/admin/page.tsx'
else
  echo "(no admin home page)"
fi

echo ""
echo "=== /admin/layout.tsx (admin nav, if any) ==="
if [ -f 'src/app/admin/layout.tsx' ]; then
  cat 'src/app/admin/layout.tsx'
else
  echo "(no /admin/layout.tsx)"
fi
