#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== FPRAward model in schema.prisma ==="
awk '/^model FPRAward \{/{flag=1} flag; /^\}/{if(flag){flag=0; exit}}' prisma/schema.prisma
echo ""
echo "=== Original git history of the FPR section in the public round page ==="
git log -p --follow -- 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' \
  | grep -E '^\+\s|^\-\s|^@@' \
  | grep -E 'fprAwards|FPRAward|a\.user|a\.team|a\.carClass|a\.driverName' \
  | head -40
