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

  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();

  // 1. iRLM mapping inventory
  console.log('=== Seasons with iRLM mapping ===');
  const seasons = await p.season.findMany({
    select: {
      id: true, name: true, irlmLeagueName: true, irlmSeasonId: true,
      league: { select: { slug: true, name: true } },
    },
    orderBy: { year: 'desc' },
  });
  for (const s of seasons) {
    console.log('  ' + s.league.slug.padEnd(20) + ' / ' + s.name.padEnd(20) +
      '  irlmLeagueName=' + (s.irlmLeagueName ?? '∅').padEnd(50) +
      '  irlmSeasonId=' + (s.irlmSeasonId ?? '∅'));
  }

  console.log('');
  console.log('=== Rounds with irlmEventId ===');
  const roundsWithIrlm = await p.round.findMany({
    where: { irlmEventId: { not: null } },
    select: {
      id: true, roundNumber: true, name: true, irlmEventId: true, startsAt: true,
      season: { select: { name: true, irlmLeagueName: true, league: { select: { slug: true } } } },
    },
    orderBy: { startsAt: 'asc' },
    take: 20,
  });
  for (const r of roundsWithIrlm) {
    console.log('  ' + r.season.league.slug.padEnd(18) + ' / ' + r.season.name.padEnd(15) +
      '  R' + r.roundNumber + ' ' + r.name.padEnd(30) +
      '  irlmEventId=' + r.irlmEventId +
      '  irlmLeagueName=' + (r.season.irlmLeagueName ?? '∅'));
  }
  console.log('');
  console.log('Total rounds with irlmEventId: ' + roundsWithIrlm.length);

  await p.\$disconnect();

  if (roundsWithIrlm.length === 0) {
    console.log('');
    console.log('No rounds linked to iRLM events. Reviews-pull is blocked until at least one round has irlmEventId.');
    console.log('You can set this via Admin → Edit Round, OR run the existing IRLM results pull which sets it as a side-effect.');
    return;
  }

  // 2. Login and probe the first round
  const login = await fetch(base + '/Authenticate/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  });
  const token = (await login.json()).token;
  const headers = { Authorization: 'Bearer ' + token };

  console.log('');
  console.log('=== Probing /Events/{eventId}/Reviews for first 5 rounds ===');
  for (const r of roundsWithIrlm.slice(0, 5)) {
    if (!r.season.irlmLeagueName) {
      console.log('  R' + r.roundNumber + ' — no irlmLeagueName on season, skipping');
      continue;
    }
    const path = '/' + r.season.irlmLeagueName + '/Events/' + r.irlmEventId + '/Reviews';
    const url = base + encodeURI(path);
    const res = await fetch(url, { headers });
    if (res.ok) {
      const reviews = await res.json();
      const count = Array.isArray(reviews) ? reviews.length : '?';
      console.log('  R' + r.roundNumber + ' ' + r.name + ' (event ' + r.irlmEventId + ') → reviews: ' + count);
      if (Array.isArray(reviews) && reviews.length > 0) {
        console.log('    First review:');
        console.log(JSON.stringify(reviews[0], null, 2));
        return;
      }
    } else {
      console.log('  R' + r.roundNumber + ' → HTTP ' + res.status);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"
