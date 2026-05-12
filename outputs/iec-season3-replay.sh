#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node <<'NODE'
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const p = new PrismaClient();

// ---------- Round schedule ----------
// Race start 17:30 local (CET=UTC+1, CEST=UTC+2). DST 2025: ends Sun 26 Oct.
// DST 2026: starts Sun 29 Mar. So:
//   Sep 20 2025  → CEST → 15:30Z
//   Oct 25 2025  → CEST (last day before switch) → 15:30Z
//   Nov 22 2025  → CET  → 16:30Z
//   Dec 06 2025  → CET  → 16:30Z
//   Jan 24 2026  → CET  → 16:30Z
//   Feb 28 2026  → CET  → 16:30Z
const SCHEDULE = [
  [1, 'Watkins Glen Boot',  'Watkins Glen International',                  'Boot',         '2025-09-20T15:30:00Z'],
  [2, 'Nürburgring GP',     'Nürburgring',                                  'Grand Prix BES/WEC', '2025-10-25T15:30:00Z'],
  [3, 'Silverstone GP',     'Silverstone Circuit',                         'Grand Prix',   '2025-11-22T16:30:00Z'],
  [4, 'Indianapolis Road',  'Indianapolis Motor Speedway',                  'Road Course',  '2025-12-06T16:30:00Z'],
  [5, 'Laguna Seca',        'WeatherTech Raceway at Laguna Seca',          'Full Course',  '2026-01-24T16:30:00Z'],
  [6, 'Imola GP',           'Autodromo Internazionale Enzo e Dino Ferrari','Grand Prix',   '2026-02-28T16:30:00Z'],
];

// ---------- Endurance defaults for the scoring system ----------
const ENDURANCE_POINTS = {};
[35,30,27,25,23,21,19,17,15,13,11,10,9,8,7,6,5,4,3,2].forEach((v, i) => { ENDURANCE_POINTS[String(i+1)] = v; });

function splitName(displayName) {
  const trim = String(displayName ?? '').trim();
  if (!trim) return { firstName: null, lastName: null };
  const parts = trim.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

function reasonStatus(r) {
  const x = (r ?? '').toLowerCase();
  if (!x || x === 'running' || x.includes('classified')) return 'CLASSIFIED';
  if (x.includes('disqualif')) return 'DSQ';
  if (x.includes('disconnect')) return 'DSQ';
  if (x.includes('did not start') || x === 'dns') return 'DNS';
  return 'DNF';
}
function tenK(v) {
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v / 10);
}

async function main() {
  // ============================================================
  // 1. League / scoring system / season
  // ============================================================
  const league = await p.league.findUnique({ where: { slug: 'cas-iec' } });
  if (!league) throw new Error('cas-iec league not found.');

  let ss = await p.scoringSystem.findFirst({ where: { name: { contains: 'IEC', mode: 'insensitive' } } });
  if (!ss) {
    ss = await p.scoringSystem.create({
      data: {
        name: 'CAS IEC',
        description: 'Endurance team championship — 1 race per round, F1-style points, no drops.',
        racesPerRound: 1,
        pointsTable: ENDURANCE_POINTS,
        participationPoints: 1,
        participationMinDistancePct: 75,
        racePointsMinDistancePct: 50,
        participationInCombined: true,
      },
    });
    console.log('Created scoring system: ' + ss.name);
  } else {
    console.log('Using scoring system: ' + ss.name);
  }

  let season = await p.season.findFirst({
    where: { leagueId: league.id, OR: [{ name: { contains: 'Season 3', mode: 'insensitive' } }, { name: { contains: '3rd', mode: 'insensitive' } }] },
  });
  if (!season) {
    season = await p.season.create({
      data: {
        leagueId: league.id,
        name: 'Season 3',
        year: 2025,
        scoringSystemId: ss.id,
        isMulticlass: true,
        proAmEnabled: false,
        teamScoringMode: 'SUM_ALL',
        teamScoringBestN: null,
        status: 'COMPLETED',
        startsOn: new Date('2025-09-20T00:00:00Z'),
        endsOn: new Date('2026-02-28T23:59:59Z'),
      },
    });
    console.log('Created season: ' + season.name + ' (id ' + season.id + ')');
  } else {
    console.log('Using season: ' + season.name + ' (id ' + season.id + ')');
  }

  // ============================================================
  // 2. Rounds
  // ============================================================
  for (const [num, name, track, cfg, iso] of SCHEDULE) {
    const existing = await p.round.findFirst({
      where: { seasonId: season.id, roundNumber: num },
    });
    if (existing) {
      console.log('  R' + num + ' ' + name + ' — exists');
      continue;
    }
    await p.round.create({
      data: {
        seasonId: season.id,
        roundNumber: num,
        name, track, trackConfig: cfg,
        startsAt: new Date(iso),
        status: 'COMPLETED',
        raceLengthMinutes: 180,
      },
    });
    console.log('  R' + num + ' ' + name + ' — created (' + iso + ')');
  }
  const rounds = await p.round.findMany({
    where: { seasonId: season.id },
    orderBy: { roundNumber: 'asc' },
  });

  // ============================================================
  // 3. Read all JSONs + collect teams + drivers
  // ============================================================
  const dir = 'CAS_Leagues/IEC';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => path.join(dir, f));
  console.log('');
  console.log('Found ' + files.length + ' JSON file(s).');

  // Map filename → parsed JSON + chosen round
  const jsonByFile = new Map();
  const teamsAcrossSeason = new Map(); // iracingTeamId → { displayName }
  const driversAcrossSeason = new Map(); // cust_id → { firstName, lastName, country }

  for (const file of files) {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    const data = j?.data;
    if (!data) { console.log('  ' + file + ' — invalid JSON, skipping'); continue; }

    // Match to a round by start_time proximity (within 36h)
    const start = new Date(data.start_time);
    let bestRound = null;
    let bestDelta = Infinity;
    for (const r of rounds) {
      const delta = Math.abs(r.startsAt.getTime() - start.getTime());
      if (delta < bestDelta) { bestDelta = delta; bestRound = r; }
    }
    if (!bestRound || bestDelta > 36 * 3600 * 1000) {
      console.log('  ' + file + ' — start ' + data.start_time + ' has no matching round (closest ' + (bestRound?.name ?? 'none') + ')');
      continue;
    }
    jsonByFile.set(file, { data, round: bestRound });
    console.log('  ' + path.basename(file) + ' → R' + bestRound.roundNumber + ' ' + bestRound.name);

    // Collect teams + drivers from RACE session
    const race = (data.session_results || []).find(s => s.simsession_type === 6);
    if (!race) continue;
    for (const t of (race.results || [])) {
      if (typeof t.team_id !== 'number' || !Array.isArray(t.driver_results)) continue;
      if (!teamsAcrossSeason.has(t.team_id)) {
        teamsAcrossSeason.set(t.team_id, { displayName: String(t.display_name ?? '').trim() });
      }
      for (const d of t.driver_results) {
        if (typeof d.cust_id !== 'number') continue;
        if (!driversAcrossSeason.has(d.cust_id)) {
          const { firstName, lastName } = splitName(d.display_name);
          driversAcrossSeason.set(d.cust_id, {
            firstName,
            lastName,
            country: typeof d.country_code === 'string' && d.country_code.length === 2 ? d.country_code.toUpperCase() : null,
          });
        }
      }
    }
  }

  console.log('');
  console.log('Distinct teams across season   : ' + teamsAcrossSeason.size);
  console.log('Distinct drivers across season : ' + driversAcrossSeason.size);

  // ============================================================
  // 4. Create teams
  // ============================================================
  const teamMap = new Map(); // iracingTeamId → team.id
  for (const [iracingTeamId, info] of teamsAcrossSeason.entries()) {
    let team = await p.team.findFirst({ where: { seasonId: season.id, iracingTeamId } });
    if (!team) {
      const byName = await p.team.findFirst({ where: { seasonId: season.id, name: { equals: info.displayName, mode: 'insensitive' } } });
      if (byName) {
        team = await p.team.update({ where: { id: byName.id }, data: { iracingTeamId } });
      } else {
        team = await p.team.create({
          data: { seasonId: season.id, name: info.displayName || ('Team ' + Math.abs(iracingTeamId)), iracingTeamId },
        });
      }
    }
    teamMap.set(iracingTeamId, team.id);
  }
  console.log('Teams ensured: ' + teamMap.size);

  // ============================================================
  // 5. Create users + approved registrations
  // ============================================================
  const admin = await p.user.findFirst({ where: { role: 'ADMIN' } });
  const regMap = new Map(); // cust_id → registration.id
  for (const [custId, info] of driversAcrossSeason.entries()) {
    let user = await p.user.findUnique({ where: { iracingMemberId: String(custId) } });
    if (!user) {
      user = await p.user.create({
        data: {
          iracingMemberId: String(custId),
          firstName: info.firstName,
          lastName: info.lastName,
          countryCode: info.country,
          role: 'DRIVER',
        },
      });
    } else if ((!user.firstName && info.firstName) || (!user.lastName && info.lastName) || (!user.countryCode && info.country)) {
      user = await p.user.update({
        where: { id: user.id },
        data: {
          firstName: user.firstName ?? info.firstName,
          lastName: user.lastName ?? info.lastName,
          countryCode: user.countryCode ?? info.country,
        },
      });
    }

    let reg = await p.registration.findUnique({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
    });
    if (!reg) {
      reg = await p.registration.create({
        data: {
          seasonId: season.id,
          userId: user.id,
          status: 'APPROVED',
          approvedById: admin?.id ?? null,
          approvedAt: new Date(),
        },
      });
    } else if (reg.status !== 'APPROVED') {
      reg = await p.registration.update({
        where: { id: reg.id },
        data: { status: 'APPROVED', approvedById: admin?.id ?? null, approvedAt: new Date() },
      });
    }
    regMap.set(custId, reg.id);
  }
  console.log('Registrations ensured: ' + regMap.size);

  // ============================================================
  // 6. Helpers for car class / car
  // ============================================================
  async function ensureCarClass(iracingCarClassId, name, shortName) {
    if (iracingCarClassId != null) {
      const found = await p.carClass.findFirst({ where: { seasonId: season.id, iracingCarClassId } });
      if (found) return found;
    }
    if (shortName) {
      const byName = await p.carClass.findFirst({
        where: {
          seasonId: season.id,
          OR: [
            { name: { equals: shortName, mode: 'insensitive' } },
            { shortCode: { equals: shortName.toUpperCase().slice(0, 8) } },
          ],
        },
      });
      if (byName) {
        if (iracingCarClassId != null && byName.iracingCarClassId == null) {
          await p.carClass.update({ where: { id: byName.id }, data: { iracingCarClassId } });
        }
        return byName;
      }
    }
    const baseShort = (shortName || name || 'CL').toUpperCase().slice(0, 8);
    let unique = baseShort;
    let n = 2;
    while (await p.carClass.findFirst({ where: { seasonId: season.id, shortCode: unique } })) {
      unique = (baseShort + n).slice(0, 8);
      n++;
    }
    return p.carClass.create({
      data: {
        seasonId: season.id,
        name: name ?? shortName ?? 'Class',
        shortCode: unique,
        iracingCarClassId,
      },
    });
  }

  async function ensureCar(carClassId, iracingCarId, carName) {
    if (iracingCarId == null) return null;
    const exist = await p.car.findFirst({ where: { seasonId: season.id, iracingCarId } });
    if (exist) return exist;
    return p.car.create({
      data: { seasonId: season.id, carClassId, name: carName || ('iRacing #' + iracingCarId), iracingCarId },
    });
  }

  // ============================================================
  // 7. Import each JSON into its round
  // ============================================================
  for (const [file, { data, round }] of jsonByFile.entries()) {
    console.log('');
    console.log('Importing ' + path.basename(file) + ' → R' + round.roundNumber + ' ' + round.name);

    // REPLACE: wipe existing TeamResult + RaceResult for this round
    await p.teamResult.deleteMany({ where: { roundId: round.id } });
    await p.raceResult.deleteMany({ where: { roundId: round.id } });

    const race = (data.session_results || []).find(s => s.simsession_type === 6);
    if (!race) { console.log('  no RACE session found, skipping'); continue; }

    const rows = (race.results || []).filter(r => typeof r.team_id === 'number' && Array.isArray(r.driver_results));
    const maxLaps = rows.reduce((m, r) => Math.max(m, r.laps_complete || 0), 0);
    let teamCount = 0, driverParticipations = 0;

    for (const t of rows) {
      const carClass = await ensureCarClass(t.car_class_id, t.car_class_name, t.car_class_short_name);
      const car = await ensureCar(carClass.id, t.car_id, t.car_name);

      const teamRowId = teamMap.get(t.team_id);
      if (!teamRowId) { console.log('    team ' + t.team_id + ' not in roster, skipping'); continue; }

      const distancePct = maxLaps > 0 ? Math.min(100, Math.floor((t.laps_complete / maxLaps) * 100)) : 0;
      const teamFinishPos = (t.finish_position ?? 0) + 1;

      const tr = await p.teamResult.create({
        data: {
          roundId: round.id,
          teamId: teamRowId,
          raceNumber: 1,
          finishPosition: teamFinishPos,
          classPosition: t.finish_position_in_class != null && t.finish_position_in_class >= 0 ? t.finish_position_in_class + 1 : null,
          startPosition: t.starting_position != null && t.starting_position >= 0 ? t.starting_position + 1 : null,
          lapsCompleted: t.laps_complete ?? 0,
          raceDistancePct: distancePct,
          bestLapTimeMs: tenK(t.best_lap_time),
          totalIncidents: t.incidents ?? 0,
          finishStatus: reasonStatus(t.reason_out),
          carId: car?.id ?? null,
          carClassId: carClass?.id ?? null,
        },
      });
      teamCount++;

      for (const d of (t.driver_results || [])) {
        const regId = regMap.get(d.cust_id);
        if (!regId) continue;

        // Sync registration's team
        await p.registration.update({ where: { id: regId }, data: { teamId: teamRowId } });

        await p.teamRoundDriver.create({
          data: {
            teamResultId: tr.id,
            registrationId: regId,
            lapsCompleted: d.laps_complete ?? 0,
            lapsLed: d.laps_lead ?? 0,
            bestLapTimeMs: tenK(d.best_lap_time),
            averageLapMs: tenK(d.average_lap),
            incidents: d.incidents ?? 0,
            iRating: typeof d.newi_rating === 'number' && d.newi_rating > 0 ? d.newi_rating : null,
            finishStatus: reasonStatus(d.reason_out),
          },
        });

        // Per-driver RaceResult — gives stint data to existing driver views
        const driverDistancePct = maxLaps > 0 ? Math.min(100, Math.floor((d.laps_complete / maxLaps) * 100)) : 0;
        await p.raceResult.create({
          data: {
            roundId: round.id,
            registrationId: regId,
            raceNumber: 1,
            finishPosition: teamFinishPos,
            classPosition: t.finish_position_in_class != null && t.finish_position_in_class >= 0 ? t.finish_position_in_class + 1 : null,
            startPosition: t.starting_position != null && t.starting_position >= 0 ? t.starting_position + 1 : null,
            lapsCompleted: d.laps_complete ?? 0,
            raceDistancePct: driverDistancePct,
            bestLapTimeMs: tenK(d.best_lap_time),
            iRating: typeof d.newi_rating === 'number' && d.newi_rating > 0 ? d.newi_rating : null,
            incidents: d.incidents ?? 0,
            finishStatus: reasonStatus(d.reason_out),
            carId: car?.id ?? null,
          },
        });
        driverParticipations++;
      }
    }
    console.log('  teams: ' + teamCount + ', driver-participations: ' + driverParticipations);
  }

  // ============================================================
  // 8. Final summary
  // ============================================================
  console.log('');
  console.log('=== Final summary ===');
  for (const r of rounds) {
    const teamCount = await p.teamResult.count({ where: { roundId: r.id } });
    const drivers = await p.raceResult.count({ where: { roundId: r.id } });
    console.log('  R' + r.roundNumber + ' ' + r.name + ' — ' + teamCount + ' teams, ' + drivers + ' driver-rows');
  }

  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
NODE
