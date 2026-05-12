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
    where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
    include: { scoringSystem: true },
  });
  if (!season) { console.log('CC 10th not found.'); return; }
  const ss = season.scoringSystem;
  const tableR1 = (ss.pointsTable ?? {});
  const tableR2 = (ss.pointsTableRace2 ?? tableR1);
  const minRacePct = ss.racePointsMinDistancePct ?? 50;
  const minPartPct = ss.participationMinDistancePct ?? 75;
  const partPoints = ss.participationPoints ?? 0;

  console.log('Scoring system: ' + ss.name);
  console.log('  Race 1 points (top 5): ' + JSON.stringify(['1','2','3','4','5'].map(k => (tableR1)[k])));
  console.log('  Race 2 points (top 5): ' + JSON.stringify(['1','2','3','4','5'].map(k => (tableR2)[k])));
  console.log('  participation: ' + partPoints + ' (min ' + minPartPct + '%, race-points min ' + minRacePct + '%)');
  console.log('');

  const rounds = await p.round.findMany({
    where: { seasonId: season.id },
    include: {
      raceResults: { include: { registration: true } },
    },
    orderBy: { roundNumber: 'asc' },
  });

  for (const round of rounds) {
    if (round.raceResults.length === 0) {
      console.log('R' + round.roundNumber + ' ' + round.name + ' — no results, skipping');
      continue;
    }
    console.log('R' + round.roundNumber + ' ' + round.name);

    // Step 1: per-result race points
    for (const r of round.raceResults) {
      const tbl = r.raceNumber === 2 ? tableR2 : tableR1;
      let raw = 0;
      const status = r.finishStatus;
      if (status !== 'DSQ' && status !== 'DNS' && (r.raceDistancePct ?? 0) >= minRacePct) {
        raw = tbl[String(r.finishPosition)] ?? 0;
      }
      await p.raceResult.update({
        where: { id: r.id },
        data: { rawPointsAwarded: raw, participationPointsAwarded: 0 }, // reset participation; step 2 fills it
      });
    }

    // Step 2: participation — only on the LOWEST raceNumber per registration in this round.
    const grouped = new Map(); // registrationId → [results]
    for (const r of round.raceResults) {
      if (!grouped.has(r.registrationId)) grouped.set(r.registrationId, []);
      grouped.get(r.registrationId).push(r);
    }
    for (const [regId, list] of grouped.entries()) {
      list.sort((a, b) => a.raceNumber - b.raceNumber);
      const head = list[0];
      let part = 0;
      if (head.finishStatus !== 'DSQ' && head.finishStatus !== 'DNS' && (head.raceDistancePct ?? 0) >= minPartPct) {
        part = partPoints;
      }
      await p.raceResult.update({ where: { id: head.id }, data: { participationPointsAwarded: part } });
    }

    // Step 3: DSQ-forfeit — if ANY race in the round is DSQ, zero everything for that registration.
    for (const [regId, list] of grouped.entries()) {
      const anyDsq = list.some((r) => r.finishStatus === 'DSQ');
      if (!anyDsq) continue;
      for (const r of list) {
        await p.raceResult.update({
          where: { id: r.id },
          data: { rawPointsAwarded: 0, participationPointsAwarded: 0 },
        });
      }
    }

    console.log('  ' + round.raceResults.length + ' results recomputed.');
  }

  // Show a sample
  console.log('');
  console.log('=== Sample: R2 Mount Panorama, race 1, top 6 ===');
  const sample = await p.round.findFirst({
    where: { seasonId: season.id, name: { contains: 'Mount Panorama', mode: 'insensitive' } },
    include: {
      raceResults: {
        where: { raceNumber: 1 },
        include: { registration: { include: { user: true } } },
        orderBy: { finishPosition: 'asc' },
        take: 8,
      },
    },
  });
  if (sample) {
    for (const r of sample.raceResults) {
      console.log('  P' + r.finishPosition + ' ' +
        (r.registration.user.firstName ?? '?') + ' ' + (r.registration.user.lastName ?? '?').padEnd(20) +
        ' raw=' + String(r.rawPointsAwarded).padStart(2) +
        ' part=' + r.participationPointsAwarded +
        ' status=' + r.finishStatus);
    }
  }
  await p.\$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
"
