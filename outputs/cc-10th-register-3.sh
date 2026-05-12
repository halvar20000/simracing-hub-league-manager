#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const DRIVERS = [
  { iracing: '740091', firstName: 'Willi',   lastName: 'Brand' },
  { iracing: '820006', firstName: 'Andreas', lastName: 'Wuschnakowski' },
  { iracing: '912856', firstName: 'Thomas',  lastName: 'Herbrig' },
];

async function main() {
  // 1. Find CC 10th Season
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
    include: { league: true },
  });
  if (!season) { console.error('CC 10th Season not found.'); process.exit(1); }
  console.log('Season: ' + season.league.name + ' / ' + season.name);

  // 2. Find an admin to record as approver (optional)
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });
  if (admin) console.log('Approver: ' + (admin.firstName || '') + ' ' + (admin.lastName || '') + ' (' + admin.email + ')');
  console.log('');

  for (const d of DRIVERS) {
    // Find or create user by iracingMemberId
    let user = await p.user.findUnique({ where: { iracingMemberId: d.iracing } });
    if (!user) {
      // Maybe the user exists by name but without iRacing ID — check.
      const byName = await p.user.findFirst({
        where: {
          firstName: { equals: d.firstName, mode: 'insensitive' },
          lastName:  { equals: d.lastName,  mode: 'insensitive' },
        },
      });
      if (byName && !byName.iracingMemberId) {
        user = await p.user.update({
          where: { id: byName.id },
          data: { iracingMemberId: d.iracing },
        });
        console.log('  Linked existing user ' + user.firstName + ' ' + user.lastName + ' to iRacing #' + d.iracing);
      }
    }
    if (!user) {
      user = await p.user.create({
        data: {
          firstName: d.firstName,
          lastName:  d.lastName,
          iracingMemberId: d.iracing,
          role: 'DRIVER',
        },
      });
      console.log('  Created user ' + user.firstName + ' ' + user.lastName + ' (#' + d.iracing + ')');
    } else {
      console.log('  User exists: ' + (user.firstName||'') + ' ' + (user.lastName||'') + ' (#' + d.iracing + ')');
    }

    // Find or create registration
    const existing = await p.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (existing) {
      if (existing.status !== 'APPROVED') {
        await p.registration.update({
          where: { id: existing.id },
          data: {
            status: 'APPROVED',
            approvedById: admin?.id ?? null,
            approvedAt: new Date(),
          },
        });
        console.log('    Registration upgraded to APPROVED.');
      } else {
        console.log('    Already registered + APPROVED.');
      }
    } else {
      await p.registration.create({
        data: {
          seasonId: season.id,
          userId: user.id,
          status: 'APPROVED',
          approvedById: admin?.id ?? null,
          approvedAt: new Date(),
        },
      });
      console.log('    Registered and approved.');
    }
  }

  // 3. Final roster
  const roster = await p.registration.findMany({
    where: { seasonId: season.id, status: 'APPROVED' },
    include: { user: true },
    orderBy: [{ user: { lastName: 'asc' } }],
  });
  console.log('');
  console.log('Approved roster (' + roster.length + '):');
  for (const r of roster) {
    console.log('  - ' + (r.user.firstName||'') + ' ' + (r.user.lastName||'') + ' (#' + (r.user.iracingMemberId||'-') + ')');
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
