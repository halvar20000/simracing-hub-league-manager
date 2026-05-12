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
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  });
  const token = (await login.json()).token;
  const headers = { Authorization: 'Bearer ' + token };

  // 1. Find any season with irlmLeagueName + irlmSeasonId set, in any league.
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const seasons = await p.season.findMany({
    where: { irlmLeagueName: { not: null }, irlmSeasonId: { not: null } },
    include: {
      league: { select: { slug: true } },
      rounds: { where: { irlmEventId: { not: null } }, take: 1 },
    },
  });
  console.log('Seasons with iRLM mapping (' + seasons.length + '):');
  for (const s of seasons) {
    console.log('  ' + s.league.slug + ' / ' + s.name + ' → irlmLeagueName=\"' + s.irlmLeagueName + '\" seasonId=' + s.irlmSeasonId + ' (sample roundEventId=' + (s.rounds[0]?.irlmEventId ?? 'none') + ')');
  }

  if (seasons.length === 0) {
    console.log('');
    console.log('=> No seasons configured for iRLM. Open Admin → a season → Edit and set irlmLeagueName + irlmSeasonId.');
    await p.\$disconnect();
    return;
  }

  // 2. For the first season with mapping, pull ALL events from iRLM Schedules and probe each event's /Reviews.
  const target = seasons[0];
  console.log('');
  console.log('Probing reviews for: ' + target.league.slug + ' / ' + target.name);
  // iRLM Schedules: /{leagueName}/Schedules/{scheduleId}/Events — but we need a scheduleId.
  // Try /{leagueName}/Seasons/{seasonId}/Schedules to list all schedules.
  const schedRes = await fetch(base + encodeURI(\`/\${target.irlmLeagueName}/Seasons/\${target.irlmSeasonId}/Schedules\`), { headers });
  if (!schedRes.ok) {
    console.log('  Schedules fetch failed: ' + schedRes.status);
  } else {
    const schedules = await schedRes.json();
    console.log('  Found ' + schedules.length + ' schedule(s). First scheduleId=' + (schedules[0]?.scheduleId ?? schedules[0]?.id ?? '?'));
    const sched = schedules[0];
    if (sched) {
      const sid = sched.scheduleId ?? sched.id;
      const evRes = await fetch(base + encodeURI(\`/\${target.irlmLeagueName}/Schedules/\${sid}/Events?includeDetails=true\`), { headers });
      if (evRes.ok) {
        const events = await evRes.json();
        console.log('  Found ' + events.length + ' event(s) in schedule ' + sid);
        for (const ev of events) {
          const reviewsRes = await fetch(base + encodeURI(\`/\${target.irlmLeagueName}/Events/\${ev.id}/Reviews\`), { headers });
          const body = reviewsRes.ok ? await reviewsRes.json() : await reviewsRes.text();
          const count = Array.isArray(body) ? body.length : '?';
          console.log('    Event ' + ev.id + ' (' + (ev.name ?? '?') + ', ' + (ev.date ?? '?') + ') → reviews: ' + count);
          if (Array.isArray(body) && body.length > 0) {
            console.log('      First review: ' + JSON.stringify(body[0], null, 2).slice(0, 1500));
            // Stop after first event with reviews so we have a sample structure
            break;
          }
        }
      }
    }
  }

  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
