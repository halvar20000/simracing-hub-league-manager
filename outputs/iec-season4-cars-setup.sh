#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

cat > ./_iec_cars_setup.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  // ---- 1. Find IEC Season 4 ----
  const iec = await p.season.findFirst({
    where: {
      league: { slug: 'cas-iec' },
      year: 2026,
      name: { contains: 'Season 4' },
    },
    include: {
      league: true,
      carClasses: { include: { cars: true } },
    },
  });
  if (!iec) {
    console.error('  IEC Season 4 not found.');
    process.exit(1);
  }
  console.log('IEC Season: ' + iec.id + '  ' + iec.name + ' ' + iec.year);

  const lmp2 = iec.carClasses.find((c) => c.name === 'LMP2');
  const gt3 = iec.carClasses.find((c) => c.name === 'GT3');
  const pcup = iec.carClasses.find((c) => c.name === 'Porsche Cup');
  if (!lmp2 || !gt3 || !pcup) {
    console.error('  Missing one of LMP2/GT3/Porsche Cup in IEC Season 4.');
    process.exit(1);
  }
  console.log('  LMP2: ' + lmp2.id + '  cars=' + lmp2.cars.length);
  console.log('  GT3:  ' + gt3.id + '  cars=' + gt3.cars.length);
  console.log('  PCUP: ' + pcup.id + '  cars=' + pcup.cars.length);

  // ---- 2. Fetch the canonical GT3 list from GT3 WCT 12th season ----
  const wct = await p.season.findFirst({
    where: { league: { slug: 'cas-gt3-wct' } },
    orderBy: [{ year: 'desc' }, { name: 'asc' }],
    include: {
      carClasses: {
        include: { cars: { orderBy: { displayOrder: 'asc' } } },
      },
    },
  });
  if (!wct) {
    console.error('  GT3 WCT season not found.');
    process.exit(1);
  }
  const wctGt3 = wct.carClasses.flatMap((cc) => cc.cars);
  console.log('');
  console.log('Source GT3 catalogue (from ' + wct.name + ' ' + wct.year + '):  ' + wctGt3.length + ' cars');

  // ---- 3. Copy GT3 cars into IEC Season 4 ----
  console.log('');
  console.log('Upserting GT3 cars into IEC Season 4...');
  let order = 0;
  for (const car of wctGt3) {
    await p.car.upsert({
      where: { carClassId_name: { carClassId: gt3.id, name: car.name } },
      update: { iracingCarId: car.iracingCarId, displayOrder: order },
      create: {
        seasonId: iec.id,
        carClassId: gt3.id,
        name: car.name,
        iracingCarId: car.iracingCarId,
        displayOrder: order,
      },
    });
    console.log('  ✓ ' + car.name + (car.iracingCarId !== null ? '  (iR ' + car.iracingCarId + ')' : ''));
    order++;
  }

  // ---- 4. LMP2 Dallara P217 ----
  console.log('');
  console.log('Adding LMP2 car...');
  await p.car.upsert({
    where: { carClassId_name: { carClassId: lmp2.id, name: 'Dallara P217' } },
    update: { iracingCarId: 128, displayOrder: 0 },
    create: {
      seasonId: iec.id,
      carClassId: lmp2.id,
      name: 'Dallara P217',
      iracingCarId: 128,
      displayOrder: 0,
    },
  });
  console.log('  ✓ Dallara P217 (iR 128)');

  // ---- 5. Porsche Cup ----
  console.log('');
  console.log('Adding Porsche Cup car...');
  await p.car.upsert({
    where: { carClassId_name: { carClassId: pcup.id, name: 'Porsche 911 (992.2)' } },
    update: { iracingCarId: 208, displayOrder: 0 },
    create: {
      seasonId: iec.id,
      carClassId: pcup.id,
      name: 'Porsche 911 (992.2)',
      iracingCarId: 208,
      displayOrder: 0,
    },
  });
  console.log('  ✓ Porsche 911 (992.2) (iR 208)');

  // ---- 6. Final state ----
  console.log('');
  console.log('Final IEC Season 4 state:');
  const final = await p.season.findUnique({
    where: { id: iec.id },
    include: {
      carClasses: {
        orderBy: { displayOrder: 'asc' },
        include: { cars: { orderBy: { displayOrder: 'asc' } } },
      },
    },
  });
  for (const cc of final.carClasses) {
    console.log('  ' + cc.name + ' (' + cc.cars.length + ' cars):');
    for (const car of cc.cars) {
      console.log('    - ' + car.name + (car.iracingCarId !== null ? '  (iR ' + car.iracingCarId + ')' : ''));
    }
  }

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
JS
node ./_iec_cars_setup.cjs
rm ./_iec_cars_setup.cjs

echo ""
echo "Done. IEC Season 4 now has cars in all three classes."
echo "Phase 2b (team-leader form) is the next step — say go and I'll build it."
