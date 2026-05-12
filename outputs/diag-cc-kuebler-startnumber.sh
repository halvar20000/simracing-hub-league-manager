#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== JSON files in CAS_Leagues/CC ==="
ls -la CAS_Leagues/CC/

echo ""
echo "=== Check each JSON for Thomas Kuebler + show car_numbers ==="
node -e "
const fs = require('fs');
for (const f of fs.readdirSync('CAS_Leagues/CC').filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('CAS_Leagues/CC/' + f, 'utf8'));
  const d = j.data || {};
  const track = d.track?.track_name + ' (' + (d.track?.config_name || '-') + ')';
  console.log('--- ' + f + ' [' + track + '] ---');
  for (const s of d.session_results || []) {
    if (s.simsession_type !== 6) continue;
    console.log('  Session: ' + s.simsession_name);
    for (const r of s.results || []) {
      if (!r.cust_id) continue;
      const name = r.display_name || '';
      const num = r.livery?.car_number || '?';
      const matchKuebler = /kuebler|kübler/i.test(name) ? '  ←  K!' : '';
      console.log('    #' + num.padEnd(3) + ' cust=' + String(r.cust_id).padEnd(8) + ' ' + name.padEnd(30) + matchKuebler);
    }
  }
}
"

echo ""
echo "=== Existing CC 10th season roster (start numbers from DB) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.season.findFirst({
  where: { league: { slug: 'cas-combined-cup' }, name: { contains: '10th', mode: 'insensitive' } },
  include: {
    registrations: {
      where: { status: 'APPROVED' },
      include: { user: true },
      orderBy: [{ startNumber: 'asc' }],
    },
  },
}).then(s => {
  if (!s) { console.log('(no season)'); p.\$disconnect(); return; }
  console.log('Season: ' + s.name + ' (' + s.registrations.length + ' approved)');
  for (const r of s.registrations) {
    console.log('  #' + (r.startNumber ?? '-').toString().padEnd(3) + ' iRacingId=' + (r.user.iracingMemberId ?? '-').padEnd(9) + ' ' + (r.user.firstName ?? '?') + ' ' + (r.user.lastName ?? '?'));
  }
  p.\$disconnect();
});
"

echo ""
echo "=== Search for Thomas Kuebler in our user table ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findMany({
  where: {
    OR: [
      { firstName: { contains: 'Thomas', mode: 'insensitive' } },
      { lastName: { contains: 'Kuebler', mode: 'insensitive' } },
      { lastName: { contains: 'Kübler', mode: 'insensitive' } },
    ],
  },
  select: { id: true, firstName: true, lastName: true, iracingMemberId: true },
}).then(us => {
  for (const u of us) console.log('  ' + (u.firstName||'?') + ' ' + (u.lastName||'?') + '  iRacingId=' + (u.iracingMemberId||'-'));
  if (us.length === 0) console.log('  (no Kuebler/Kübler in user table)');
  p.\$disconnect();
});
"
