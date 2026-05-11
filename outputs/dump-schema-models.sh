#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== All model + enum names in prisma/schema.prisma ==="
grep -nE '^(model|enum)\s+\w+' prisma/schema.prisma

echo ""
echo "=== File size + line count ==="
wc -l prisma/schema.prisma

echo ""
echo "=== Lines mentioning 'penalty' (case-insensitive) ==="
grep -niE 'penalt' prisma/schema.prisma | head -40

echo ""
echo "=== Lines mentioning 'decision' or 'verdict' ==="
grep -niE 'decision|verdict' prisma/schema.prisma | head -30

echo ""
echo "=== Lines mentioning 'result' ==="
grep -niE 'result|classif' prisma/schema.prisma | head -30

echo ""
echo "=== Round model (whole block by line number) ==="
START=$(grep -nE '^model Round\b' prisma/schema.prisma | head -1 | cut -d: -f1)
if [ -n "${START:-}" ]; then
  awk "NR>=$START && /^}/ {print; exit} NR>=$START {print}" prisma/schema.prisma
else
  echo "  No 'model Round' found."
fi
