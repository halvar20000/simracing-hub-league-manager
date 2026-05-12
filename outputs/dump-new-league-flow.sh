#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== src/app/admin/leagues/new/page.tsx ==="
cat src/app/admin/leagues/new/page.tsx
echo ""
echo "=== Search for league-creation actions ==="
grep -rn 'createLeague\|prisma\.league\.create' src/lib/actions/ 2>/dev/null | head -10
echo ""
echo "=== Existing /admin/leagues/[slug]/seasons/new (if any) ==="
if [ -f 'src/app/admin/leagues/[slug]/seasons/new/page.tsx' ]; then
  cat 'src/app/admin/leagues/[slug]/seasons/new/page.tsx'
else
  echo "(no /seasons/new page)"
fi
echo ""
echo "=== Action files for leagues + seasons ==="
ls -la src/lib/actions/ | grep -E 'leagues|seasons'
