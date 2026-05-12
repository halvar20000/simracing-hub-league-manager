#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
PAGE='src/lib/standings.ts'

echo "=== Lines around 'roundsCompleted' (constructor area) ==="
LINE=$(grep -n 'roundsCompleted:' "$PAGE" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE > 35 ? LINE - 35 : 1))
  END=$((LINE + 15))
  echo "(lines $START-$END)"
  sed -n "${START},${END}p" "$PAGE"
fi

echo ""
echo "=== Confirm interface change DID NOT land (file should look identical to before) ==="
grep -n 'excludedAt' "$PAGE" || echo "  (no excludedAt references — interface change wasn't saved, as expected)"
