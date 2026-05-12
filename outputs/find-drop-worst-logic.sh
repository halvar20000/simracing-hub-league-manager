#!/usr/bin/env bash
# Find where the "drop worst N rounds" feature actually lives — if anywhere.
# Plus: dump the full ScoringSystem rows so we can see whether dropWorstNRounds
# is configured on GT4 Masters or any other system.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Codebase search for drop / worst / strikethrough / line-through ==="
grep -rn 'dropWorstN\|dropWorst\b\|worstResult\|worst-result\|strikethrough\|line-through' \
  src/ scripts/ prisma/ 2>/dev/null | grep -v node_modules || true

echo ""
echo "=== ScoringSystem rows in DB (full) ==="
mkdir -p scripts
cat > scripts/dump-scoring-systems.ts <<'EOF'
import { prisma } from "@/lib/prisma";
async function main() {
  const ss = await prisma.scoringSystem.findMany();
  for (const s of ss) {
    console.log({
      name: s.name,
      participationPoints: s.participationPoints,
      participationMinDistancePct: s.participationMinDistancePct,
      bonusFastestLap: s.bonusFastestLap,
      bonusPole: s.bonusPole,
      bonusMostLapsLed: s.bonusMostLapsLed,
      dropWorstNRounds: s.dropWorstNRounds,
      fprEnabled: s.fprEnabled,
      fprMode: s.fprMode,
    });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/dump-scoring-systems.ts

echo ""
echo "=== Existing GT4 seasons + their state ==="
cat > scripts/list-gt4-seasons.ts <<'EOF'
import { prisma } from "@/lib/prisma";
async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-tss-gt4" } });
  if (!league) { console.log("league not found"); return; }
  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id },
    include: { scoringSystem: { select: { name: true, dropWorstNRounds: true } } },
  });
  for (const s of seasons) {
    console.log({
      id: s.id,
      name: s.name,
      year: s.year,
      status: s.status,
      isMulticlass: s.isMulticlass,
      scoringSystem: s.scoringSystem.name,
      dropWorstNRounds: s.scoringSystem.dropWorstNRounds,
    });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/list-gt4-seasons.ts

echo ""
echo "=== Standings page line numbers for any UI strikethrough / decoration ==="
grep -n 'line-through\|strikethrough\|decoration-' \
  'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' \
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' \
  'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' \
  2>/dev/null || echo "(none found)"
