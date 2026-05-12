#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Existing register page (if any) ==="
PAGE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'
[ -f "$PAGE" ] && cat "$PAGE" || echo "(no register page yet)"

echo ""
echo "=== Auth setup (auth.ts / middleware.ts) ==="
[ -f "src/auth.ts" ] && cat "src/auth.ts" || echo "(no src/auth.ts)"
echo ""
[ -f "auth.ts" ] && cat "auth.ts" || true
echo ""
[ -f "middleware.ts" ] && cat "middleware.ts" || echo "(no middleware.ts)"
echo ""
[ -f "src/middleware.ts" ] && cat "src/middleware.ts" || echo "(no src/middleware.ts)"

echo ""
echo "=== Existing registration server actions (if any) ==="
for f in src/lib/actions/registrations.ts src/lib/actions/registration.ts src/lib/actions/register.ts; do
  if [ -f "$f" ]; then
    echo "--- $f ---"
    cat "$f"
  fi
done

echo ""
echo "=== References to '/register' across the app ==="
grep -rn --include='*.tsx' --include='*.ts' "/register\b" src/ 2>/dev/null | head -20

echo ""
echo "=== Registration model recap ==="
awk '/^model Registration/,/^}/' prisma/schema.prisma
