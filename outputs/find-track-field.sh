#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

ADMIN='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== Round model in schema.prisma ==="
awk '/^model Round \{/{flag=1} flag; /^\}/{if(flag){flag=0; exit}}' prisma/schema.prisma

echo ""
echo "=== How the admin page renders the track name ==="
grep -n -E 'track|Track' "$ADMIN" | head -20

echo ""
echo "=== Show 30 lines around the first match (the header section) ==="
LINE=$(grep -n -E 'track|Track' "$ADMIN" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE > 10 ? LINE - 10 : 1))
  END=$((LINE + 20))
  sed -n "${START},${END}p" "$ADMIN"
fi
