#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/lib/actions/leagues.ts ==="
cat src/lib/actions/leagues.ts || echo "(missing)"

echo ""
echo "=== src/app/admin/leagues/page.tsx ==="
cat src/app/admin/leagues/page.tsx || echo "(missing)"

echo ""
echo "=== src/app/admin/leagues/[slug]/page.tsx (first 80 lines) ==="
sed -n '1,80p' 'src/app/admin/leagues/[slug]/page.tsx' || echo "(missing)"

echo ""
echo "=== Prisma League model + relations referencing leagueId ==="
awk '/^model League /,/^}/' prisma/schema.prisma
echo "---"
grep -n 'leagueId\b' prisma/schema.prisma || true
