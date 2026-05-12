#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# Load .env into the shell's environment before launching node.
if [ -f ".env" ]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  echo "[env] Loaded .env"
else
  echo "[env] .env not found in $(pwd)"
  exit 1
fi

# Sanity check (don't print the actual values)
echo "  IRLM_USERNAME       = ${IRLM_USERNAME:+(set)}"
echo "  IRLM_PASSWORD       = ${IRLM_PASSWORD:+(set)}"
echo "  IRLM_API_BASE_URL   = ${IRLM_API_BASE_URL:-(default)}"
echo "  DATABASE_URL        = ${DATABASE_URL:+(set)}"

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
  if (!token) { console.error('No token in login response. Keys:', Object.keys(data).join(',')); process.exit(1); }
  console.log('[OK] Logged in.');

  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const season = await p.season.findFirst({
    where: { league: { slug: 'cas-iec' }, irlmLeagueName: { not: null } },
    select: { name: true, irlmLeagueName: true, irlmSeasonId: true },
  });
  await p.\$disconnect();

  const leagueName = season?.irlmLeagueName ?? 'CAS - International Endurance Championship';
  const seasonId = season?.irlmSeasonId ?? '';
  console.log('Using leagueName=' + leagueName + (seasonId ? ' seasonId=' + seasonId : ''));

  const candidates = [
    \`/\${leagueName}/Reviews\`,
    \`/\${leagueName}/Reviews?statusFilter=Open\`,
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

  // Also peek at an event detail object to see if reviews live there.
  try {
    const evList = await fetch(base + encodeURI(\`/\${leagueName}/Schedules/1/Events?includeDetails=true\`), { headers })
      .then(r => r.ok ? r.json() : null);
    if (Array.isArray(evList) && evList.length > 0) {
      const ev = evList.find(e => e.hasResult) ?? evList[0];
      if (ev?.id) {
        const det = await fetch(base + encodeURI(\`/\${leagueName}/Events/\${ev.id}\`), { headers })
          .then(r => r.ok ? r.json() : null);
        console.log('');
        console.log('[Event detail] id=' + ev.id + ' keys=' + (det ? Object.keys(det).join(', ') : 'none'));
      }
    }
  } catch {}
}
main().catch(e => { console.error(e); process.exit(1); });
"
