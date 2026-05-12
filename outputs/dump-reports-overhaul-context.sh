#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Prisma: IncidentStatus enum + EvidenceKind enum + ParticipantRole enum ==="
awk '/^enum IncidentStatus/,/^}/' prisma/schema.prisma
echo ""
awk '/^enum EvidenceKind/,/^}/' prisma/schema.prisma
echo ""
awk '/^enum ParticipantRole/,/^}/' prisma/schema.prisma

echo ""
echo "=== src/app/reports/[reportId]/page.tsx ==="
cat 'src/app/reports/[reportId]/page.tsx'

echo ""
echo "=== src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx (steward queue list) ==="
cat 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx'

echo ""
echo "=== src/lib/actions/admin-reports.ts ==="
cat 'src/lib/actions/admin-reports.ts'

echo ""
echo "=== Database stewards/admins — how is steward role detected? ==="
grep -rn --include='*.ts' --include='*.tsx' -E "STEWARD|requireSteward|isSteward" src/ | head -20

echo ""
echo "=== Are there any unread/badge components already? ==="
grep -rn --include='*.tsx' "badge" src/components 2>/dev/null | head -10 || echo "(none found)"

echo ""
echo "=== src/components/nav.tsx (current — to confirm admin link area) ==="
cat src/components/nav.tsx | sed -n '1,40p'
