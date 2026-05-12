#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# Probe iRLM API for review-style endpoints. Auth via existing IRLM_USERNAME/IRLM_PASSWORD.
# Then test each candidate path and print response status + first 600 chars of body.

node -e "
async function main() {
  const u = process.env.IRLM_USERNAME;
  const pw = process.env.IRLM_PASSWORD;
  const base = process.env.IRLM_API_BASE_URL || 'https://irleaguemanager.net/api';
  if (!u || !pw) { console.error('IRLM_USERNAME / IRLM_PASSWORD missing in env.'); process.exit(1); }

  const login = await fetch(base + '/Authenticate/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: u, password: pw }),
  });
  if (!login.ok) { console.error('Login failed:', login.status, await login.text()); process.exit(1); }
  const data = await login.json();
  const token = data.token || data.accessToken || data.jwt || data.idToken;
  if (!token) { console.error('No token in login response:', Object.keys(data).join(',')); process.exit(1); }
  console.log('[OK] Logged in.');

  // Read first IEC season to get an irlmLeagueName + irlmSeasonId for testing.
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, irlmLeagueName: { not: null } },
    select: { name: true, irlmLeagueName: true, irlmSeasonId: true },
  });
  await p.\$disconnect();
  if (!season) { console.log('No IEC season with irlmLeagueName configured. Falling back to a known league name.'); }
  const leagueName = season?.irlmLeagueName ?? 'CAS - International Endurance Championship';
  const seasonId = season?.irlmSeasonId ?? '';
  console.log('Using leagueName=' + leagueName + (seasonId ? ' seasonId=' + seasonId : ''));

  const candidates = [
    \`/\${leagueName}/Reviews\`,
    \`/\${leagueName}/Reviews?statusFilter=Open\`,
    \`/\${leagueName}/Reviews?finished=false\`,
    seasonId ? \`/\${leagueName}/Seasons/\${seasonId}/Reviews\` : null,
    seasonId ? \`/\${leagueName}/Seasons/\${seasonId}/Protests\` : null,
    \`/\${leagueName}/Protests\`,
    \`/\${leagueName}/Incidents\`,
    \`/\${leagueName}/Reviews/Open\`,
  ].filter(Boolean);

  const headers = { Authorization: 'Bearer ' + token };
  for (const path of candidates) {
    const url = base + encodeURI(path);
    try {
      const r = await fetch(url, { headers });
      const body = await r.text();
      console.log('');
      console.log('[' + r.status + '] ' + path);
      console.log('  body: ' + body.slice(0, 600).replace(/\\n/g, ' '));
    } catch (e) {
      console.log('[ERR] ' + path + ' — ' + (e instanceof Error ? e.message : String(e)));
    }
  }

  // Also try fetching one event and inspect for an embedded reviews/protests array.
  const events = await fetch(base + encodeURI(\`/\${leagueName}/Schedules/1/Events?includeDetails=true\`), { headers })
    .then(r => r.ok ? r.json() : null).catch(() => null);
  if (events && Array.isArray(events) && events.length > 0) {
    const ev = events.find(e => e.hasResult) ?? events[0];
    if (ev?.id) {
      const evDetailUrl = base + encodeURI(\`/\${leagueName}/Events/\${ev.id}\`);
      const evDetail = await fetch(evDetailUrl, { headers }).then(r => r.ok ? r.json() : null).catch(() => null);
      console.log('');
      console.log('[Event detail] keys: ' + (evDetail ? Object.keys(evDetail).join(', ') : '(none)'));
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
"
