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
  // ---------- Find SFL scoring system ----------
  const sflSeason = await p.season.findFirst({
    where: { league: { slug: 'cas-sfl-cup' } },
    include: { scoringSystem: true },
    orderBy: { year: 'desc' },
  });
  if (!sflSeason || !sflSeason.scoringSystem) {
    console.error('No SFL Cup season with a scoring system found.');
    process.exit(1);
  }
  const src = sflSeason.scoringSystem;
  console.log('Source: ' + src.name);
  console.log('  pointsTable     :', JSON.stringify(src.pointsTable));
  console.log('  pointsTableRace2:', JSON.stringify(src.pointsTableRace2));
  console.log('  racesPerRound   :', src.racesPerRound);
  console.log('  participation   :', src.participationPoints, '(min ' + src.participationMinDistancePct + '%)');
  console.log('  raceMinDist%    :', src.racePointsMinDistancePct);
  console.log('  bonus pole/fl/mll:', src.bonusPole, '/', src.bonusFastestLap, '/', src.bonusMostLapsLed);
  console.log('  drop worst N    :', src.dropWorstNRounds);
  console.log('  partInCombined  :', src.participationInCombined);
  console.log('  protestCooldown :', src.protestCooldownHours);
  console.log('  protestWindow   :', src.protestWindowHours);
  console.log('  deferPenalties  :', src.deferPenaltyPoints);
  console.log('  categoryPoints  :', JSON.stringify(src.categoryPointsTable));
  console.log('');

  // ---------- Pick a name (handle collision) ----------
  const baseName = 'CAS Combined Cup';
  let name = baseName;
  let n = 2;
  while (await p.scoringSystem.findUnique({ where: { name } })) {
    name = baseName + ' (' + n + ')';
    n++;
  }
  console.log('Will create new scoring system named: ' + name);

  // ---------- Clone ----------
  const created = await p.scoringSystem.create({
    data: {
      name,
      description: 'Copy of ' + src.name + ' for the multiclass Combined Cup. Per-car ranking is automatic via the new By Car tab on standings.',
      pointsTable: src.pointsTable,
      pointsTableRace2: src.pointsTableRace2 ?? undefined,
      classPointsTable: src.classPointsTable ?? undefined,
      participationPoints: src.participationPoints,
      participationMinDistancePct: src.participationMinDistancePct,
      racePointsMinDistancePct: src.racePointsMinDistancePct,
      bonusFastestLap: src.bonusFastestLap,
      bonusPole: src.bonusPole,
      bonusMostLapsLed: src.bonusMostLapsLed,
      dropWorstNRounds: src.dropWorstNRounds,
      fprEnabled: src.fprEnabled,
      fprTiers: src.fprTiers ?? undefined,
      fprMode: src.fprMode,
      participationInCombined: src.participationInCombined,
      racesPerRound: src.racesPerRound,
      protestWindowHours: src.protestWindowHours,
      protestCooldownHours: src.protestCooldownHours,
      deferPenaltyPoints: src.deferPenaltyPoints,
      categoryPointsTable: src.categoryPointsTable ?? undefined,
    },
  });

  console.log('');
  console.log('Created scoring system:');
  console.log('  id  : ' + created.id);
  console.log('  name: ' + created.name);
  console.log('');

  // ---------- Show CC seasons + their current scoring system ----------
  const ccSeasons = await p.season.findMany({
    where: { league: { slug: 'cas-combined-cup' } },
    include: { scoringSystem: true },
    orderBy: { year: 'desc' },
  });
  if (ccSeasons.length === 0) {
    console.log('(No CAS Combined Cup season exists yet — when you create one, pick this scoring system from the dropdown.)');
  } else {
    console.log('CAS Combined Cup seasons currently in DB:');
    for (const s of ccSeasons) {
      console.log('  - ' + s.name + ' (year ' + s.year + ', isMulticlass=' + s.isMulticlass + ', scoring=' + (s.scoringSystem?.name ?? 'none') + ')');
    }
    console.log('');
    console.log('To assign the new scoring system:');
    console.log('  Admin → Combined Cup → open a season → Edit season → choose ' + created.name);
    console.log('  Also tick \"Multi-class season\" on the season if it isn\\'t already.');
  }

  await p.\$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "Done. Open Admin → Scoring systems to verify, then go to Admin → Combined Cup to assign it to a season."
