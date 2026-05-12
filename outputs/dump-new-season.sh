#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/app/admin/leagues/[slug]/seasons/new/page.tsx ==="
cat 'src/app/admin/leagues/[slug]/seasons/new/page.tsx'

echo ""
echo "=== src/app/admin/leagues/new/page.tsx (for the same check) ==="
[ -f 'src/app/admin/leagues/new/page.tsx' ] && cat 'src/app/admin/leagues/new/page.tsx' || echo "(missing)"

echo ""
echo "=== Find admin pages that still use bg-white / text-gray-* (light mode leftovers) ==="
grep -rn --include='*.tsx' -E '(bg-white|text-gray-[0-9])' src/app/admin 2>/dev/null | head -40
