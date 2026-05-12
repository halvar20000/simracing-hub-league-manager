#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DRIVER = { iracing: '709942', firstName: 'Daniel', lastName: 'Brandt' };

async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
    include: { league: true },
  });
  if (!season) { console.error('CC 10th Season not found.'); process.exit(1); }
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });

  let user = await p.user.findUnique({ where: { iracingMemberId: DRIVER.iracing } });
  if (!user) {
    const byName = await p.user.findFirst({
      where: {
        firstName: { equals: DRIVER.firstName, mode: 'insensitive' },
        lastName:  { equals: DRIVER.lastName,  mode: 'insensitive' },
      },
    });
    if (byName && !byName.iracingMemberId) {
      user = await p.user.update({
        where: { id: byName.id },
        data: { iracingMemberId: DRIVER.iracing },
      });
      console.log('Linked existing ' + user.firstName + ' ' + user.lastName + ' to iRacing #' + DRIVER.iracing);
    }
  }
  if (!user) {
    user = await p.user.create({
      data: { firstName: DRIVER.firstName, lastName: DRIVER.lastName, iracingMemberId: DRIVER.iracing, role: 'DRIVER' },
    });
    console.log('Created user ' + user.firstName + ' ' + user.lastName + ' (#' + DRIVER.iracing + ')');
  } else {
    console.log('User exists: ' + (user.firstName||'') + ' ' + (user.lastName||'') + ' (#' + DRIVER.iracing + ')');
  }

  const existing = await p.registration.findUnique({
    where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
  });
  if (existing) {
    if (existing.status !== 'APPROVED') {
      await p.registration.update({
        where: { id: existing.id },
        data: { status: 'APPROVED', approvedById: admin?.id ?? null, approvedAt: new Date() },
      });
      console.log('  Registration upgraded to APPROVED.');
    } else {
      console.log('  Already registered + APPROVED.');
    }
  } else {
    await p.registration.create({
      data: {
        seasonId: season.id, userId: user.id,
        status: 'APPROVED',
        approvedById: admin?.id ?? null,
        approvedAt: new Date(),
      },
    });
    console.log('  Registered and approved.');
  }

  const roster = await p.registration.findMany({
    where: { seasonId: season.id, status: 'APPROVED' },
    include: { user: true },
    orderBy: [{ user: { lastName: 'asc' } }],
  });
  console.log('');
  console.log('CC 10th roster (' + roster.length + '):');
  for (const r of roster) {
    console.log('  - ' + (r.user.firstName||'') + ' ' + (r.user.lastName||'') + ' (#' + (r.user.iracingMemberId||'-') + ')');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
