#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== All files involved in the reports system ==="
find src -type f \( -path '*report*' -o -path '*Report*' \) 2>/dev/null

echo ""
echo "=== Prisma model: Report (if any) ==="
awk '/^model Report/,/^}/' prisma/schema.prisma 2>/dev/null || echo "(no Report model found)"

echo ""
echo "=== Prisma model: IncidentReport (if any) ==="
awk '/^model IncidentReport/,/^}/' prisma/schema.prisma 2>/dev/null || echo "(no IncidentReport model found)"

echo ""
echo "=== /reports list page ==="
PAGE='src/app/reports/page.tsx'
[ -f "$PAGE" ] && cat "$PAGE" || echo "($PAGE missing)"

echo ""
echo "=== /reports/new page (if any) ==="
NP='src/app/reports/new/page.tsx'
[ -f "$NP" ] && cat "$NP" || echo "($NP missing)"

echo ""
echo "=== Server actions for reports ==="
for f in src/lib/actions/reports.ts src/lib/actions/report.ts src/lib/actions/incident-reports.ts; do
  if [ -f "$f" ]; then
    echo ""
    echo "--- $f ---"
    cat "$f"
  fi
done

echo ""
echo "=== Search for any 'New Report' / 'Create Report' button strings ==="
grep -rn --include='*.tsx' --include='*.ts' -E "(New Report|Create Report|Submit Report|Report.*incident|report a)" src/ | head -30

echo ""
echo "=== Search round detail page for report-related code ==="
ROUND_PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'
if [ -f "$ROUND_PAGE" ]; then
  grep -n -E "report|Report" "$ROUND_PAGE" || echo "(no report mentions in round page)"
fi

echo ""
echo "=== Latest commits touching reports ==="
git log --oneline --all -20 -- 'src/app/reports' 'src/lib/actions/reports.ts' 'src/components/Report*' 2>/dev/null | head -30
