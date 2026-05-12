#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. CC 10th season state — proAmEnabled, isMulticlass, etc.
# ---------------------------------------------------------------------------
echo "=== CC 10th Season config ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const s = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  console.log('  isMulticlass    :', s?.isMulticlass);
  console.log('  proAmEnabled    :', s?.proAmEnabled);
  console.log('  teamScoringMode :', s?.teamScoringMode);
  console.log('  scoringSystemId :', s?.scoringSystemId);
  await p.\$disconnect();
}
main();
"

# ---------------------------------------------------------------------------
# 2. RaceResults + cars in CC 10th
# ---------------------------------------------------------------------------
echo ""
echo "=== Race results + carId state ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  });
  if (!season) { console.log('  (no season)'); return; }

  const cars = await p.car.findMany({
    where: { seasonId: season.id },
    include: { carClass: { select: { shortCode: true } } },
  });
  console.log('  Cars in season (' + cars.length + '):');
  for (const c of cars) {
    console.log('    - ' + c.name + ' (iracingCarId=' + (c.iracingCarId ?? '-') + ', class=' + (c.carClass?.shortCode ?? '-') + ')');
  }

  const carClasses = await p.carClass.findMany({
    where: { seasonId: season.id },
    orderBy: { displayOrder: 'asc' },
  });
  console.log('');
  console.log('  Car classes in season (' + carClasses.length + '):');
  for (const c of carClasses) console.log('    - ' + c.shortCode + ' / ' + c.name + ' (order=' + c.displayOrder + ')');

  const results = await p.raceResult.findMany({
    where: { round: { seasonId: season.id } },
    include: {
      registration: { include: { user: { select: { firstName: true, lastName: true } } } },
      car: { select: { name: true } },
    },
    orderBy: [{ raceNumber: 'asc' }, { finishPosition: 'asc' }],
  });
  console.log('');
  console.log('  Race results in season (' + results.length + '):');
  for (const r of results) {
    console.log('    R?#' + r.raceNumber + ' P' + r.finishPosition + ' ' +
      (r.registration.user.firstName||'') + ' ' + (r.registration.user.lastName||'') +
      ' → carId=' + (r.carId ?? 'NULL') + ' (' + (r.car?.name ?? 'no car') + ')');
  }
  await p.\$disconnect();
}
main();
"

# ---------------------------------------------------------------------------
# 3. Verify the deployed importer code has carId logic
# ---------------------------------------------------------------------------
echo ""
echo "=== Importer source — carId-related lines ==="
grep -n -E "(resolvedCarId|resolveCarId|carIracingId|carId:)" src/lib/actions/iracing-json-import.ts | head -30

echo ""
echo "=== Parser source — carIracingId line ==="
grep -n "carIracingId" src/lib/iracing-json.ts | head -10

# ---------------------------------------------------------------------------
# 4. Standings page: how Pro/Am tabs are gated
# ---------------------------------------------------------------------------
echo ""
echo "=== Standings page: Pro/Am tab gating (look for proAmEnabled / season.) ==="
sed -n '140,160p' 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'
