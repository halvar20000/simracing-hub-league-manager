#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

cat > ./_add_kevin.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const FIRST_NAME = 'Kevin';
const LAST_NAME = 'Osiewacz';
const IRACING_ID = '731903';
const LEAGUE_SLUG = 'cas-gt3-wct';
const SEASON_NAME_LIKE = '12th Season';
const CAR_NAME_LIKE = 'Porsche 911 GT3 R';
const START_NUMBER = 16;

(async () => {
  // ---- 1. Find the season ----
  const season = await p.season.findFirst({
    where: {
      league: { slug: LEAGUE_SLUG },
      name: { contains: SEASON_NAME_LIKE },
    },
    include: {
      league: true,
      carClasses: {
        include: { cars: { orderBy: { displayOrder: 'asc' } } },
      },
    },
  });
  if (!season) {
    console.error('  Season not found.');
    process.exit(1);
  }
  console.log('Season: ' + season.id);
  console.log('  ' + season.league.name + ' — ' + season.name + ' ' + season.year);

  // ---- 2. Find the car ----
  const allCars = season.carClasses.flatMap((cc) =>
    cc.cars.map((c) => ({ ...c, classId: cc.id, className: cc.name }))
  );
  const car = allCars.find((c) =>
    c.name.toLowerCase().includes(CAR_NAME_LIKE.toLowerCase())
  );
  if (!car) {
    console.error('  Car not found by name "' + CAR_NAME_LIKE + '".');
    console.error('  Available cars in season:');
    for (const c of allCars) console.error('    - ' + c.name);
    process.exit(1);
  }
  console.log('Car:    ' + car.id + '  ' + car.name + '  (class: ' + car.className + ')');

  // ---- 3. Find or create user ----
  let user = await p.user.findFirst({
    where: { iracingMemberId: IRACING_ID },
  });
  if (user) {
    console.log('User:   ' + user.id + '  ' + user.firstName + ' ' + user.lastName + '  (existing)');
    // Patch in name if missing
    if (!user.firstName || !user.lastName) {
      user = await p.user.update({
        where: { id: user.id },
        data: { firstName: FIRST_NAME, lastName: LAST_NAME },
      });
      console.log('  Filled in missing name fields.');
    }
  } else {
    try {
      user = await p.user.create({
        data: {
          firstName: FIRST_NAME,
          lastName: LAST_NAME,
          iracingMemberId: IRACING_ID,
        },
      });
    } catch (e) {
      console.error('  Could not create user without extra fields: ' + e.message);
      console.error('  Trying again with role=DRIVER fallback...');
      user = await p.user.create({
        data: {
          firstName: FIRST_NAME,
          lastName: LAST_NAME,
          iracingMemberId: IRACING_ID,
          role: 'DRIVER',
        },
      });
    }
    console.log('User:   ' + user.id + '  ' + user.firstName + ' ' + user.lastName + '  (CREATED)');
  }

  // ---- 4. Upsert registration ----
  const reg = await p.registration.upsert({
    where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    update: {
      status: 'APPROVED',
      startNumber: START_NUMBER,
      carId: car.id,
      carClassId: car.classId,
      proAmClass: 'PRO',
      startingFeePaid: 'YES',
      iracingInvitationSent: 'YES',
      iracingInvitationAccepted: 'YES',
    },
    create: {
      seasonId: season.id,
      userId: user.id,
      status: 'APPROVED',
      startNumber: START_NUMBER,
      carId: car.id,
      carClassId: car.classId,
      proAmClass: 'PRO',
      startingFeePaid: 'YES',
      iracingInvitationSent: 'YES',
      iracingInvitationAccepted: 'YES',
    },
  });
  console.log('');
  console.log('Registration: ' + reg.id);
  console.log('  status                       = ' + reg.status);
  console.log('  startNumber                  = ' + reg.startNumber);
  console.log('  carId                        = ' + reg.carId);
  console.log('  carClassId                   = ' + reg.carClassId);
  console.log('  proAmClass                   = ' + reg.proAmClass);
  console.log('  startingFeePaid              = ' + reg.startingFeePaid);
  console.log('  iracingInvitationSent        = ' + reg.iracingInvitationSent);
  console.log('  iracingInvitationAccepted    = ' + reg.iracingInvitationAccepted);

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
JS
node ./_add_kevin.cjs
rm ./_add_kevin.cjs

echo ""
echo "Done. Kevin should now appear on the GT3 WCT 12th Season roster:"
echo "  Public: https://league.simracing-hub.com/leagues/cas-gt3-wct/seasons/<id>/roster"
echo "  Admin:  https://league.simracing-hub.com/admin/leagues/cas-gt3-wct/seasons/<id>/roster"
