#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Regenerating Prisma client ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

echo ""
echo "=== Verify iracingCarClassIds is in the generated types ==="
grep -q "iracingCarClassIds" node_modules/.prisma/client/index.d.ts \
  && echo "[OK] iracingCarClassIds present in generated client." \
  || { echo "[FAIL] iracingCarClassIds NOT in generated client."; exit 1; }

echo ""
echo "=== Finish rename: GT3 2025 → GT3 ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
  });
  if (!season) { console.log('CC IEC Season 3 not found.'); return; }

  // The surviving GT3 class is the one with iracingCarClassId 4091.
  const survivor = await p.carClass.findFirst({
    where: { seasonId: season.id, iracingCarClassId: 4091 },
  });
  if (!survivor) { console.log('Surviving GT3 class not found.'); return; }

  await p.carClass.update({
    where: { id: survivor.id },
    data: {
      name: 'GT3',
      shortCode: 'GT3',
      displayOrder: 2,
      iracingCarClassIds: [4091, 2708],
    },
  });
  console.log('Renamed to GT3 (shortCode=GT3, displayOrder=2, iracingIds=[4091, 2708])');

  console.log('');
  console.log('=== Final IEC Season 3 car classes ===');
  const final = await p.carClass.findMany({
    where: { seasonId: season.id },
    include: { _count: { select: { cars: true, teamResults: true } } },
    orderBy: { displayOrder: 'asc' },
  });
  for (const c of final) {
    console.log('  ' + c.shortCode.padEnd(6) + ' / ' + c.name.padEnd(8) +
      '  iracingIds=' + JSON.stringify([c.iracingCarClassId, ...(c.iracingCarClassIds ?? [])].filter(x => x != null)) +
      '  cars=' + c._count.cars +
      '  teamResults=' + c._count.teamResults);
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
