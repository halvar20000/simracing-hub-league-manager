#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "=== Direct URL works regardless ==="
echo "Pick a season, go to:  /admin/leagues/<slug>/seasons/<id>/penalty-pool"
echo ""

echo "=== Does the file exist? ==="
ls -la "$PAGE" 2>/dev/null || { echo "(no admin season page — link must be added elsewhere)"; }
echo ""
echo "=== Existing /reports link in that page (if any) ==="
grep -n 'reports' "$PAGE" 2>/dev/null || echo "(no /reports link found)"

echo ""
echo "=== Existing /penalty-pool reference (if any) ==="
grep -n 'penalty-pool' "$PAGE" 2>/dev/null || echo "(no link yet)"

echo ""
echo "=== First 60 lines of admin season page (for header context) ==="
sed -n '1,60p' "$PAGE" 2>/dev/null || echo "(file missing)"
