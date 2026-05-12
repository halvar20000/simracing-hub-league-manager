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

  console.log('=== Current IEC Season 3 car classes ===');
  const all = await p.carClass.findMany({
    where: { seasonId: season.id },
    include: {
      _count: { select: { cars: true, teamResults: true, registrations: true } },
    },
    orderBy: { displayOrder: 'asc' },
  });
  for (const c of all) {
    console.log('  ' + c.shortCode.padEnd(8) + ' / ' + c.name.padEnd(15) +
      ' iracingCarClassId=' + (c.iracingCarClassId ?? '-') +
      ' iracingCarClassIds=' + JSON.stringify(c.iracingCarClassIds ?? []) +
      ' cars=' + c._count.cars +
      ' teamResults=' + c._count.teamResults +
      ' regs=' + c._count.registrations);
  }
  console.log('');

  // Identify all GT3 classes (any name/shortCode containing 'gt3', or iracingCarClassId 2708/4091)
  const gt3Classes = all.filter((c) =>
    /gt3/i.test(c.name) || /gt3/i.test(c.shortCode) ||
    c.iracingCarClassId === 2708 || c.iracingCarClassId === 4091 ||
    (c.iracingCarClassIds ?? []).includes(2708) ||
    (c.iracingCarClassIds ?? []).includes(4091)
  );
  if (gt3Classes.length < 2) {
    console.log('Only ' + gt3Classes.length + ' GT3 class(es) found. Nothing to merge.');
    await p.\$disconnect();
    return;
  }

  // Pick primary by team count (most teamResults wins)
  gt3Classes.sort((a, b) => b._count.teamResults - a._count.teamResults);
  const primary = gt3Classes[0];
  const secondaries = gt3Classes.slice(1);
  console.log('Primary GT3 class: ' + primary.name + ' (id=' + primary.id + ', teamResults=' + primary._count.teamResults + ')');
  console.log('Secondaries to merge in:');
  for (const s of secondaries) console.log('  - ' + s.name + ' (id=' + s.id + ', teamResults=' + s._count.teamResults + ')');
  console.log('');

  let totalCarsMoved = 0, totalTrMoved = 0, totalRegsMoved = 0, totalFprMoved = 0;
  for (const sec of secondaries) {
    const cars = await p.car.updateMany({ where: { carClassId: sec.id }, data: { carClassId: primary.id } });
    const trs  = await p.teamResult.updateMany({ where: { carClassId: sec.id }, data: { carClassId: primary.id } });
    const regs = await p.registration.updateMany({ where: { carClassId: sec.id }, data: { carClassId: primary.id } });
    const fpr  = await p.fPRAward.updateMany({ where: { carClassId: sec.id }, data: { carClassId: primary.id } });
    totalCarsMoved += cars.count; totalTrMoved += trs.count; totalRegsMoved += regs.count; totalFprMoved += fpr.count;
    console.log('  Moved from ' + sec.name + ': cars=' + cars.count + ' teamResults=' + trs.count + ' regs=' + regs.count + ' fpr=' + fpr.count);
    await p.carClass.delete({ where: { id: sec.id } });
    console.log('  Deleted secondary class: ' + sec.name);
  }

  // Update primary: rename to 'GT3', collect all iRacing class IDs
  const allIracingIds = new Set();
  if (primary.iracingCarClassId != null) allIracingIds.add(primary.iracingCarClassId);
  for (const id of (primary.iracingCarClassIds ?? [])) allIracingIds.add(id);
  for (const s of secondaries) {
    if (s.iracingCarClassId != null) allIracingIds.add(s.iracingCarClassId);
    for (const id of (s.iracingCarClassIds ?? [])) allIracingIds.add(id);
  }
  await p.carClass.update({
    where: { id: primary.id },
    data: {
      name: 'GT3',
      shortCode: 'GT3',
      displayOrder: 2,
      iracingCarClassIds: [...allIracingIds],
    },
  });
  console.log('');
  console.log('Primary renamed to GT3 (shortCode=GT3, displayOrder=2, iracingIds=' + JSON.stringify([...allIracingIds]) + ')');

  console.log('');
  console.log('=== Final IEC Season 3 car classes ===');
  const final = await p.carClass.findMany({
    where: { seasonId: season.id },
    include: { _count: { select: { cars: true, teamResults: true } } },
    orderBy: { displayOrder: 'asc' },
  });
  for (const c of final) {
    console.log('  ' + c.shortCode.padEnd(8) + ' / ' + c.name.padEnd(10) +
      ' iracingIds=' + JSON.stringify([c.iracingCarClassId, ...(c.iracingCarClassIds ?? [])].filter(x => x != null)) +
      ' cars=' + c._count.cars +
      ' teamResults=' + c._count.teamResults);
  }
  await p.\$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
"
