#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
  });
  if (!season) { console.log('CC IEC Season 3 not found.'); return; }

  // Rename Dallara P217 → LMP2
  const lmp2 = await p.carClass.findFirst({ where: { seasonId: season.id, iracingCarClassId: 2523 } });
  if (lmp2) {
    await p.carClass.update({
      where: { id: lmp2.id },
      data: { name: 'LMP2', shortCode: 'LMP2', displayOrder: 1 },
    });
    console.log('Dallara P217 → LMP2 (shortCode=LMP2, displayOrder=1)');
  } else {
    console.log('Dallara P217 class not found.');
  }

  // Rename GT4 Class → GT4
  const gt4 = await p.carClass.findFirst({ where: { seasonId: season.id, iracingCarClassId: 2268 } });
  if (gt4) {
    await p.carClass.update({
      where: { id: gt4.id },
      data: { name: 'GT4', shortCode: 'GT4', displayOrder: 3 },
    });
    console.log('GT4 Class → GT4 (shortCode=GT4, displayOrder=3)');
  } else {
    console.log('GT4 Class not found.');
  }

  // Make sure GT3 is in the middle (displayOrder=2)
  const gt3 = await p.carClass.findFirst({
    where: { seasonId: season.id, OR: [{ shortCode: 'GT3' }, { name: 'GT3' }] },
  });
  if (gt3 && gt3.displayOrder !== 2) {
    await p.carClass.update({ where: { id: gt3.id }, data: { displayOrder: 2 } });
    console.log('GT3 displayOrder set to 2 (between LMP2 and GT4).');
  }

  // Final view
  const all = await p.carClass.findMany({
    where: { seasonId: season.id },
    orderBy: { displayOrder: 'asc' },
  });
  console.log('');
  console.log('=== Final IEC Season 3 car classes ===');
  for (const c of all) {
    console.log('  ' + c.shortCode.padEnd(6) + ' / ' + c.name + ' (order=' + c.displayOrder + ', iracingIds=[' + (c.iracingCarClassId ?? '-') + ',' + (c.iracingCarClassIds ?? []).join(',') + '])');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
