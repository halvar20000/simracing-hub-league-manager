#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

S=prisma/schema.prisma

echo "=== Penalty model (line 425 onwards) ==="
sed -n '425,455p' "$S"

echo ""
echo "=== IncidentDecision model (line 407 onwards) ==="
sed -n '407,425p' "$S"

echo ""
echo "=== RaceResult model (line 246 onwards) ==="
sed -n '246,280p' "$S"

echo ""
echo "=== Registration model fields around penalty/manual ==="
sed -n '206,270p' "$S"

echo ""
echo "=== Enum: RoundStatus ==="
sed -n '469,475p' "$S"

echo ""
echo "=== Enum: Verdict ==="
sed -n '527,540p' "$S"

echo ""
echo "=== Enum: PenaltySource ==="
sed -n '537,545p' "$S"

echo ""
echo "=== Enum: PenaltyType ==="
sed -n '543,552p' "$S"

echo ""
echo "=== Enum: PenaltyCategory ==="
sed -n '559,575p' "$S"

echo ""
echo "=== Enum: IncidentStatus ==="
sed -n '505,514p' "$S"

echo ""
echo "=== GT3 WCT league slug from DB ==="
mkdir -p scripts
cat > scripts/lm_dump_league.ts <<'TS'
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const leagues = await p.league.findMany({ select: { id: true, slug: true, name: true } });
  for (const l of leagues) console.log(`  ${l.slug.padEnd(20)}  ${l.name}`);
  await p.$disconnect();
})();
TS
npx --yes tsx scripts/lm_dump_league.ts
