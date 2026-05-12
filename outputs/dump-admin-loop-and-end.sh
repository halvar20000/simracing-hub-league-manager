#!/usr/bin/env bash
# Dump the missing sections of the admin round page so I can write Phase B3
# safely (the prisma query, the registration map loop, the end of the file).
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
echo "=== Admin round page lines 25-160 (query + loop start) ==="
sed -n '25,160p' "$PAGE"
echo ""
echo "=== Admin round page lines 310-end ==="
TOTAL=$(wc -l < "$PAGE")
sed -n "310,${TOTAL}p" "$PAGE"
