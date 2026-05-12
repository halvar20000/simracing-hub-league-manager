#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Files in CAS_Leagues/SFL/ ==="
ls -la CAS_Leagues/SFL/ 2>/dev/null || { echo "(folder missing)"; exit 1; }

echo ""
echo "=== Per-file: subsession ID, track, sessions, drivers ==="
for f in CAS_Leagues/SFL/*.json; do
  echo ""
  echo "--- $f ---"
  node -e "
  const j = JSON.parse(require('fs').readFileSync('$f','utf8'));
  const d = j.data;
  console.log('  subsession_id :', d.subsession_id);
  console.log('  league        :', d.league_name);
  console.log('  league_season :', d.league_season_name);
  console.log('  track         :', d.track?.track_name, '(', d.track?.config_name || '-', ')');
  console.log('  start_time    :', d.start_time);
  console.log('  sessions      :');
  for (const s of d.session_results || []) {
    console.log('    - ' + s.simsession_name.padEnd(8),
      'type=' + s.simsession_type,
      'num=' + s.simsession_number,
      'rows=' + (s.results||[]).length);
  }
  "
done

echo ""
echo "=== Use the parser on each Silverstone file ==="
node -e "
process.env.NODE_PATH = './node_modules';
require('module').Module._initPaths();

// Inline-import the TS parser by re-implementing the key logic in JS for the dump.
// (We're not loading the TS file directly to avoid build steps.)
function tenK(v) { return typeof v==='number' && v>0 ? Math.round(v/10) : null; }
function reason(r){ const x=(r||'').toLowerCase(); if (!x||x==='running') return 'CLASSIFIED'; if (x.includes('disqualif')) return 'DSQ'; if (x.includes('did not start')) return 'DNS'; return 'DNF'; }

const fs = require('fs');
for (const f of fs.readdirSync('CAS_Leagues/SFL').filter(x=>x.endsWith('.json'))) {
  const path = 'CAS_Leagues/SFL/' + f;
  const j = JSON.parse(fs.readFileSync(path,'utf8'));
  if (!/silverstone/i.test(j.data?.track?.track_name||'')) continue;

  console.log('');
  console.log('=== Parsed result of ' + f + ' (Silverstone) ===');
  const all = j.data.session_results || [];
  const races = all.filter(s=>s.simsession_type===6).sort((a,b)=>(a.simsession_number??0)-(b.simsession_number??0));
  const qual  = all.find(s=>s.simsession_type===4);

  if (qual) {
    console.log('--- QUALIFY ---');
    console.log('  pos | cust_id  | name (CC) | best_lap');
    const rows = (qual.results||[]).filter(r=>r.cust_id);
    for (const r of rows) {
      console.log('  ' + String((r.finish_position+1)).padStart(2) + '  | ' +
        String(r.cust_id).padEnd(8) + ' | ' +
        (r.display_name||'').padEnd(28).slice(0,28) +
        ' | ' + (tenK(r.best_lap_time)||'-'));
    }
  }

  races.forEach((race, idx) => {
    const label = race.simsession_name + ' (raceNumber=' + (idx+1) + ')';
    console.log('');
    console.log('--- RACE: ' + label + ' ---');
    console.log('  pos | cust_id  | name                        | laps | inc | iR    | reason   ');
    const rows = (race.results||[]).filter(r=>r.cust_id);
    const maxLaps = rows.reduce((m,r)=>Math.max(m,r.laps_complete||0),0);
    rows.sort((a,b)=>(a.finish_position??0)-(b.finish_position??0));
    for (const r of rows) {
      console.log('  ' + String((r.finish_position+1)).padStart(2) + '  | ' +
        String(r.cust_id).padEnd(8) + ' | ' +
        (r.display_name||'').padEnd(28).slice(0,28) + ' | ' +
        String(r.laps_complete).padStart(4) + ' | ' +
        String(r.incidents).padStart(3) + ' | ' +
        String(r.newi_rating||'-').padStart(5) + ' | ' +
        reason(r.reason_out));
    }
    console.log('  (max laps in session: ' + maxLaps + ')');
  });
}
"

echo ""
echo "=== Now: pull DB results for SFL season 7, round 6 (Silverstone) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  // Find the SFL league
  const leagues = await prisma.league.findMany({
    where: { slug: { contains: 'sfl' } },
    select: { id:true, slug:true, name:true },
  });
  console.log('Candidate leagues:', leagues);

  // Find a season number 7
  const seasons = await prisma.season.findMany({
    where: { league: { slug: { contains: 'sfl' } } },
    include: { league: true },
    orderBy: { year: 'desc' },
  });
  console.log('SFL seasons:');
  for (const s of seasons) console.log('  - id=' + s.id + ' ' + s.name + ' (year ' + s.year + ')');

  // Find Silverstone round in any of those seasons
  const rounds = await prisma.round.findMany({
    where: {
      season: { league: { slug: { contains: 'sfl' } } },
      OR: [
        { track: { contains: 'Silverstone', mode: 'insensitive' } },
        { name: { contains: 'Silverstone', mode: 'insensitive' } },
      ],
    },
    include: { season: { include: { league: true } } },
    orderBy: { startsAt: 'desc' },
  });
  console.log('');
  console.log('Silverstone rounds in SFL leagues:');
  for (const r of rounds) {
    console.log('  - season=' + r.season.name + ' R' + r.roundNumber + ' ' + r.name + ' (id=' + r.id + ')');
  }

  // For the most recent Silverstone round, dump race results
  const round = rounds[0];
  if (!round) { console.log('(no Silverstone round found)'); return; }
  console.log('');
  console.log('=== DB race results for: ' + round.season.name + ' R' + round.roundNumber + ' ' + round.name + ' ===');
  const results = await prisma.raceResult.findMany({
    where: { roundId: round.id },
    include: { registration: { include: { user: true } } },
    orderBy: [{ raceNumber: 'asc' }, { finishPosition: 'asc' }],
  });
  let lastRace = null;
  for (const r of results) {
    if (r.raceNumber !== lastRace) {
      console.log('');
      console.log('--- raceNumber=' + r.raceNumber + ' ---');
      console.log('  pos | iRacingId | name                        | laps | inc | iR    | status  | rawPts | participation');
      lastRace = r.raceNumber;
    }
    console.log('  ' + String(r.finishPosition).padStart(2) + '  | ' +
      String(r.registration.user.iracingMemberId||'-').padEnd(9) + ' | ' +
      ((r.registration.user.firstName||'') + ' ' + (r.registration.user.lastName||'')).padEnd(28).slice(0,28) + ' | ' +
      String(r.lapsCompleted).padStart(4) + ' | ' +
      String(r.incidents).padStart(3) + ' | ' +
      String(r.iRating||'-').padStart(5) + ' | ' +
      r.finishStatus.padEnd(8) + ' | ' +
      String(r.rawPointsAwarded).padStart(6) + ' | ' +
      String(r.participationPointsAwarded).padStart(2));
  }
  await prisma.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
