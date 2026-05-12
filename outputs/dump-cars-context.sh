#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Car / CarClass model in schema ==="
awk '/^model Car /,/^}/' prisma/schema.prisma
echo ""
awk '/^model CarClass /,/^}/' prisma/schema.prisma

echo ""
echo "=== RaceResult model (do we already track carId per result?) ==="
awk '/^model RaceResult/,/^}/' prisma/schema.prisma | head -40

echo ""
echo "=== Cars defined in the Combined Cup season ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const ccLeague = await p.league.findFirst({ where: { slug: { contains: 'combined' } } });
  if (!ccLeague) { console.log('(no Combined Cup league found)'); return; }
  const seasons = await p.season.findMany({
    where: { leagueId: ccLeague.id },
    include: {
      cars: { include: { carClass: { select: { name: true, shortName: true } } } },
      carClasses: true,
      registrations: {
        where: { status: 'APPROVED' },
        include: { car: true, user: { select: { firstName: true, lastName: true } } },
      },
    },
    orderBy: { year: 'desc' },
  });
  for (const s of seasons) {
    console.log('');
    console.log('Season:', s.name, '(year ' + s.year + ', isMulticlass=' + s.isMulticlass + ')');
    console.log('  Car classes:');
    for (const c of s.carClasses) {
      console.log('    - ' + c.shortCode + ' ' + c.name);
    }
    console.log('  Cars:');
    for (const c of s.cars) {
      console.log('    - ' + c.name + ' (iracingCarId=' + (c.iracingCarId??'-') + ', class=' + (c.carClass?.shortCode||'?') + ')');
    }
    console.log('  Driver → car mapping (first 10):');
    for (const r of s.registrations.slice(0, 10)) {
      console.log('    - ' + r.user.firstName + ' ' + r.user.lastName + ' → ' + (r.car?.name || '(no car set)'));
    }
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Public standings page (top of file) ==="
sed -n '1,80p' 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

echo ""
echo "=== Where cls (combined/pro/am/team) tabs are switched ==="
grep -n -A 3 -E "cls === \"team\"|cls === \"am\"|cls === \"pro\"" 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' | head -40
