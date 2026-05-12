#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx'

echo "=== File size ==="
wc -l "$FILE"

echo ""
echo "=== All imports (first 50 lines) ==="
sed -n '1,50p' "$FILE"

echo ""
echo "=== All <section ...> opening tags with line numbers ==="
grep -n '<section' "$FILE" || echo "(no <section> tags found)"

echo ""
echo "=== 'return (' lines ==="
grep -n 'return (' "$FILE" || echo "(none)"

echo ""
echo "=== Lines mentioning season.status ==="
grep -n 'season\.status\|season.status' "$FILE" || echo "(none)"

echo ""
echo "=== Lines mentioning registrationToken (should be empty) ==="
grep -n 'registrationToken' "$FILE" || echo "(none — confirms missing)"

echo ""
echo "=== First H1/H2 heading lines (likely structural anchors) ==="
grep -n '<h1\|<h2' "$FILE" | head -20

echo ""
echo "=== Last 30 lines (closing structure) ==="
tail -30 "$FILE"

echo ""
echo "=== Confirm CopyTextButton component exists ==="
ls -la src/components/CopyTextButton.tsx 2>/dev/null || echo "MISSING — would need to create it"

echo ""
echo "=== Confirm season actions exist ==="
grep -n 'export async function regenerateRegistrationToken\|export async function clearRegistrationToken' src/lib/actions/seasons.ts || echo "MISSING actions"

echo ""
echo "=== Confirm Season.registrationToken in schema ==="
grep -n 'registrationToken' prisma/schema.prisma || echo "MISSING schema field"

echo ""
echo "=== NEXTAUTH_URL / NEXT_PUBLIC_BASE_URL in env (helps decide URL base) ==="
grep -E '^(NEXTAUTH_URL|NEXT_PUBLIC_BASE_URL)=' .env 2>/dev/null | sed 's/=.*$/=<set>/' || echo "(not set in .env)"
