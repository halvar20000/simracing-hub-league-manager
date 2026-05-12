#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/components/PullFromIRLMButton.tsx (the spinner pattern) ==="
cat src/components/PullFromIRLMButton.tsx 2>/dev/null || echo "(file not found)"

echo ""
echo "=== JSON import page submit button ==="
sed -n '/Import & replace/,/<\/button>/p' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import-json/page.tsx' 2>/dev/null

echo ""
echo "=== All <button> tags in admin pages (to inventory candidates) ==="
grep -rn --include='*.tsx' '<button' src/app/admin 2>/dev/null | head -40

echo ""
echo "=== All <button> tags in penalty pool / steward / report pages ==="
grep -rn --include='*.tsx' '<button' src/app/admin/leagues 2>/dev/null | head -30

echo ""
echo "=== Other admin form actions (buttons + their action URLs) ==="
grep -rn --include='*.tsx' -B 1 -A 2 'rounded bg-orange-500.*type="submit"\|type="submit".*rounded bg-orange' src/app/admin 2>/dev/null | head -30
