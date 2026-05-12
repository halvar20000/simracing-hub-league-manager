#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== A. Schema enum (source of truth) ==="
awk '/^enum IncidentStatus/,/^}/' prisma/schema.prisma

echo ""
echo "=== B. Any 'output' directive in generator block? ==="
awk '/^generator client/,/^}/' prisma/schema.prisma

echo ""
echo "=== C. Find every .prisma client index.d.ts in the project ==="
find . -name 'index.d.ts' -path '*prisma/client*' -not -path './.next/*' 2>/dev/null

echo ""
echo "=== D. Look for IncidentStatus declarations in the generated client ==="
echo "--- Definition of \$Enums.IncidentStatus or const IncidentStatus ---"
grep -n -A 8 -E 'const IncidentStatus|IncidentStatus:\s*\{' node_modules/.prisma/client/index.d.ts | head -40

echo ""
echo "--- Type alias IncidentStatus = ... ---"
grep -n -A 1 -E 'type IncidentStatus' node_modules/.prisma/client/index.d.ts | head -20

echo ""
echo "=== E. Does the generated index.d.ts mention WITHDRAWN at all? ==="
grep -n 'WITHDRAWN' node_modules/.prisma/client/index.d.ts | head -10 || echo "(NO HITS — generated client is stale)"

echo ""
echo "=== F. Likewise for the runtime enum object ==="
grep -n 'WITHDRAWN' node_modules/.prisma/client/index.js | head -5 || echo "(no hits)"

echo ""
echo "=== G. Is there a tsbuildinfo cache? ==="
find . -maxdepth 3 -name '*.tsbuildinfo' 2>/dev/null

echo ""
echo "=== H. Prisma + client versions ==="
node -e "const p=require('./package.json'); console.log('prisma',p.devDependencies?.prisma||p.dependencies?.prisma); console.log('@prisma/client',p.dependencies?.['@prisma/client']||p.devDependencies?.['@prisma/client']);"
