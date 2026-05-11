#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Existing admin penalty-pool page (head + tail) ==="
F='src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'
if [ -f "$F" ]; then
  echo "-- file: $F  (lines: $(wc -l < "$F")) --"
  echo "-- first 80 lines --"
  sed -n '1,80p' "$F"
  echo ""
  echo "-- last 60 lines --"
  tail -60 "$F"
else
  echo "  Not found: $F"
fi

echo ""
echo "=== 2. Existing penalty-pool actions (just signatures) ==="
F='src/lib/actions/penalty-pool.ts'
if [ -f "$F" ]; then
  grep -nE '^export async function|^"use server' "$F"
fi

echo ""
echo "=== 3. Where IncidentDecision is created/published (search) ==="
grep -rn -E 'incidentDecision\.(create|update|upsert)|publishedAt:\s*new Date|verdict:|IncidentDecision' src/lib/actions src/app/admin 2>/dev/null | head -25

echo ""
echo "=== 4. Where Round status is changed to COMPLETED ==="
grep -rn -E 'RoundStatus\.COMPLETED|"COMPLETED"|status:\s*"COMPLETED"|markRoundComplete|completeRound' src/ 2>/dev/null | head -25

echo ""
echo "=== 5. Server-action files in src/lib/actions/ ==="
ls -la src/lib/actions/ 2>/dev/null
