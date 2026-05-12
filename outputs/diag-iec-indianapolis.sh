#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== All JSON files in CAS_Leagues/IEC/ ==="
ls -la CAS_Leagues/IEC/*.json 2>/dev/null

echo ""
echo "=== Each file's start_time + track + race-row count ==="
node -e "
const fs = require('fs');
for (const f of fs.readdirSync('CAS_Leagues/IEC').filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('CAS_Leagues/IEC/' + f, 'utf8'));
  const d = j.data || {};
  const race = (d.session_results || []).find(s => s.simsession_type === 6);
  const teams = (race?.results || []).filter(r => typeof r.team_id === 'number' && Array.isArray(r.driver_results)).length;
  console.log('  ' + f.padEnd(44) +
    ' track=' + (d.track?.track_name || '?').padEnd(40) +
    ' (' + (d.track?.config_name || '-') + ')' +
    ' start=' + d.start_time +
    ' teams=' + teams);
}
"

echo ""
echo "=== Rounds in CAS IEC Season 3 + their import status ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const s = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, name: { contains: 'Season 3', mode: 'insensitive' } },
    include: {
      rounds: {
        orderBy: { roundNumber: 'asc' },
        include: { _count: { select: { teamResults: true, raceResults: true } } },
      },
    },
  });
  if (!s) { console.log('(season not found)'); return; }
  for (const r of s.rounds) {
    console.log('  R' + r.roundNumber + ' ' + r.name.padEnd(28) +
      ' track=' + r.track.padEnd(40) +
      ' (' + (r.trackConfig || '-') + ')' +
      ' starts=' + r.startsAt.toISOString() +
      ' | teamResults=' + r._count.teamResults +
      ' driverRows=' + r._count.raceResults);
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
