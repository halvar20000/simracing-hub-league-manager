#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/lib/standings.ts ==="
cat src/lib/standings.ts | head -200
echo "..."
echo ""

echo "=== Penalty references in scoring.ts and standings.ts ==="
grep -n -E "penalty|Penalty|manualPenalty" src/lib/scoring.ts src/lib/standings.ts | head -40

echo ""
echo "=== Steward decision page ==="
cat 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx' | head -200
echo "..."

echo ""
echo "=== Where Penalty rows are created ==="
grep -rn --include='*.ts' --include='*.tsx' "prisma.penalty.create\|prisma.penalty.deleteMany" src/ | head -10

echo ""
echo "=== Penalty model in schema ==="
awk '/^model Penalty/,/^}/' prisma/schema.prisma

echo ""
echo "=== Verdict + PenaltyType + PenaltySource enums ==="
awk '/^enum Verdict/,/^}/' prisma/schema.prisma
awk '/^enum PenaltyType/,/^}/' prisma/schema.prisma
awk '/^enum PenaltySource/,/^}/' prisma/schema.prisma

echo ""
echo "=== Decisions list page (if exists) ==="
[ -f 'src/app/leagues/[slug]/seasons/[seasonId]/decisions/page.tsx' ] && \
  head -80 'src/app/leagues/[slug]/seasons/[seasonId]/decisions/page.tsx' || \
  echo "(no decisions page)"
