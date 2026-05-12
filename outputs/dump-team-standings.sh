#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== computeTeamStandings (current implementation) ==="
sed -n '/computeTeamStandings/,/^}/p' src/lib/standings.ts | head -120

echo ""
echo "=== TeamStanding type ==="
grep -n -A 15 "interface TeamStanding" src/lib/standings.ts | head -25

echo ""
echo "=== Where Team tab renders on standings page ==="
grep -n -B 2 -A 15 'cls === "team"' 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' | head -60

echo ""
echo "=== Sample data: top 5 TeamResults from R3 Silverstone ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const r = await p.round.findFirst({
    where: { season: { league: { slug: 'cas-iec' } }, name: { contains: 'Silverstone' } },
  });
  if (!r) return;
  const rows = await p.teamResult.findMany({
    where: { roundId: r.id },
    include: { team: true, carClass: { select: { name: true, shortCode: true } } },
    orderBy: { finishPosition: 'asc' },
    take: 8,
  });
  for (const t of rows) {
    console.log('  P' + String(t.finishPosition).padStart(2) +
      ' (class P' + String(t.classPosition).padStart(2) + ')' +
      ' ' + (t.team.name||'').padEnd(34) +
      ' class=' + (t.carClass?.shortCode||'-').padEnd(6) +
      ' laps=' + t.lapsCompleted +
      ' inc=' + t.totalIncidents +
      ' status=' + t.finishStatus);
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
