#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f ".env" ]; then set -a; source .env; set +a; fi

node -e "
async function main() {
  const u = process.env.IRLM_USERNAME;
  const pw = process.env.IRLM_PASSWORD;
  const base = process.env.IRLM_API_BASE_URL || 'https://irleaguemanager.net/api';
  const login = await fetch(base + '/Authenticate/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  });
  const token = (await login.json()).token;
  const headers = { Authorization: 'Bearer ' + token };

  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const rounds = await p.round.findMany({
    where: {
      irlmEventId: { not: null },
      season: { league: { slug: 'cas-gt3-wct' }, irlmLeagueName: { not: null } },
    },
    select: {
      id: true, name: true, roundNumber: true, irlmEventId: true,
      season: { select: { irlmLeagueName: true } },
    },
    orderBy: { roundNumber: 'asc' },
  });
  await p.\$disconnect();
  console.log('GT3 WCT rounds with iRLM mapping: ' + rounds.length);

  let foundSample = false;
  for (const r of rounds) {
    const path = '/' + r.season.irlmLeagueName + '/Events/' + r.irlmEventId + '/Protests';
    const url = base + encodeURI(path);
    try {
      const res = await fetch(url, { headers });
      if (res.ok) {
        const protests = await res.json();
        const count = Array.isArray(protests) ? protests.length : '?';
        console.log('  R' + r.roundNumber + ' (event ' + r.irlmEventId + ') → protests: ' + count);
        if (Array.isArray(protests) && protests.length > 0 && !foundSample) {
          foundSample = true;
          console.log('    First protest:');
          console.log(JSON.stringify(protests[0], null, 2));
        }
      } else {
        console.log('  R' + r.roundNumber + ' → HTTP ' + res.status);
      }
    } catch (e) {
      console.log('  R' + r.roundNumber + ' → ERR ' + (e instanceof Error ? e.message : ''));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"
