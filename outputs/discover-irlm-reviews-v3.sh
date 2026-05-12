#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

if [ -f ".env" ]; then
  set -a; source .env; set +a
fi

node -e "
async function main() {
  const u = process.env.IRLM_USERNAME;
  const pw = process.env.IRLM_PASSWORD;
  const base = process.env.IRLM_API_BASE_URL || 'https://irleaguemanager.net/api';

  // 1. Try Swagger to discover all endpoints
  const swaggerCandidates = [
    'https://irleaguemanager.net/swagger/v1/swagger.json',
    'https://irleaguemanager.net/api/swagger/v1/swagger.json',
    'https://irleaguemanager.net/swagger.json',
    'https://irleaguemanager.net/openapi.json',
    'https://irleaguemanager.net/api/openapi.json',
  ];
  let swaggerData = null;
  for (const url of swaggerCandidates) {
    try {
      const r = await fetch(url);
      if (r.ok) {
        const ct = r.headers.get('content-type') ?? '';
        if (ct.includes('json')) {
          swaggerData = await r.json();
          console.log('[OK] swagger from ' + url);
          break;
        }
      }
      console.log('[' + r.status + '] swagger ' + url);
    } catch (e) {}
  }

  if (swaggerData?.paths) {
    const reviewPaths = Object.keys(swaggerData.paths).filter(p => /review|protest|incident/i.test(p));
    console.log('');
    console.log('=== Review/protest/incident endpoints from swagger ===');
    for (const p of reviewPaths) {
      const methods = Object.keys(swaggerData.paths[p]).filter(m => m !== 'parameters');
      console.log('  ' + methods.map(m => m.toUpperCase()).join(',').padEnd(7) + ' ' + p);
    }
  }

  // 2. Login
  const login = await fetch(base + '/Authenticate/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  });
  const data = await login.json();
  const token = data.token || data.accessToken || data.jwt || data.idToken;
  if (!token) { console.error('Login failed.'); process.exit(1); }
  const headers = { Authorization: 'Bearer ' + token };

  // 3. Find a session ID we can test against
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, irlmLeagueName: { not: null } },
    include: { rounds: { where: { irlmEventId: { not: null } }, take: 1 } },
  });
  await p.\$disconnect();
  const leagueName = season?.irlmLeagueName ?? 'CAS - International Endurance Championship';
  const eventId = season?.rounds?.[0]?.irlmEventId ?? null;
  console.log('');
  console.log('Test eventId=' + eventId + ' (from round ' + (season?.rounds?.[0]?.id ?? 'none') + ')');

  // 4. If we have an eventId, probe event-scoped review endpoints
  const sessionPaths = eventId ? [
    \`/\${leagueName}/Events/\${eventId}\`,
    \`/\${leagueName}/Events/\${eventId}/Reviews\`,
    \`/\${leagueName}/Events/\${eventId}/Sessions\`,
    \`/\${leagueName}/Events/\${eventId}/Results\`,
  ] : [];

  for (const path of sessionPaths) {
    const url = base + encodeURI(path);
    const r = await fetch(url, { headers });
    const body = await r.text();
    console.log('');
    console.log('[' + r.status + '] ' + path);
    console.log('  body: ' + body.slice(0, 800).replace(/\\n/g, ' '));
  }

  // 5. If event detail has session IDs, probe one
  if (eventId) {
    const evDetail = await fetch(base + encodeURI(\`/\${leagueName}/Events/\${eventId}\`), { headers })
      .then(r => r.ok ? r.json() : null);
    const sessionIds = [];
    if (evDetail) {
      if (Array.isArray(evDetail.sessions)) for (const s of evDetail.sessions) if (s.id) sessionIds.push(s.id);
      if (Array.isArray(evDetail.subSessions)) for (const s of evDetail.subSessions) if (s.id) sessionIds.push(s.id);
    }
    console.log('');
    console.log('Found ' + sessionIds.length + ' sessionId(s) in event detail.');
    for (const sid of sessionIds.slice(0, 2)) {
      const paths = [
        \`/\${leagueName}/Sessions/\${sid}/Reviews\`,
        \`/\${leagueName}/Sessions/\${sid}\`,
      ];
      for (const path of paths) {
        const r = await fetch(base + encodeURI(path), { headers });
        const body = await r.text();
        console.log('');
        console.log('[' + r.status + '] ' + path);
        console.log('  body: ' + body.slice(0, 500).replace(/\\n/g, ' '));
      }
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"
