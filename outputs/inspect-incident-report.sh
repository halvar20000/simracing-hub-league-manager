#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. IncidentReport model fields (line 343 onwards) ==="
sed -n '343,395p' prisma/schema.prisma

echo ""
echo "=== 2. Steward review page (admin/.../reports/[reportId]/page.tsx) ==="
F='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'
if [ -f "$F" ]; then
  echo "  Lines: $(wc -l < "$F")"
  echo ""
  echo "-- TOP (1..120) --"
  sed -n '1,120p' "$F"
  echo ""
  echo "-- Lines mentioning timestamp / submittedAt / lap / occurredAt / incidentAt --"
  grep -nE 'submittedAt|occurredAt|incidentAt|incidentTime|incidentLap|formatDate' "$F" | head -20
  echo ""
  echo "-- Penalty category / level UI block (search for penaltyCategory, categoryLevel) --"
  grep -nE 'penaltyCategory|categoryLevel|pointsForLevel|select.*name="penaltyCategory"|select.*name="categoryLevel"' "$F" | head -20
fi

echo ""
echo "=== 3. The pointsForLevel helper ==="
F='src/lib/penalty-categories.ts'
if [ -f "$F" ]; then
  cat "$F"
fi
