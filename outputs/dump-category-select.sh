#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

F='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'

echo "=== Category-level select area (lines 230..305) ==="
sed -n '230,305p' "$F"

echo ""
echo "=== Top of decision form (lines 200..230) for context ==="
sed -n '200,230p' "$F"
