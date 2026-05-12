#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== src/lib/irlm.ts ==="
cat src/lib/irlm.ts 2>/dev/null || echo "(missing)"

echo ""
echo "=== src/lib/actions/irlm-import.ts (first 100 lines) ==="
sed -n '1,100p' src/lib/actions/irlm-import.ts 2>/dev/null

echo ""
echo "=== Env keys related to iRLM (without values) ==="
grep -E '^IRLM_|^IRLEAGUE_' .env 2>/dev/null | sed 's/=.*/=…/' || echo "(no IRLM env keys)"

echo ""
echo "=== Any existing review/protest endpoints referenced in code? ==="
grep -rni --include='*.ts' --include='*.tsx' -E "review|protest|incident.*irlm|irlm.*incident" src/lib 2>/dev/null | head -20
