#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f ".env" ]; then set -a; source .env; set +a; fi

echo "=== Step 1: ask Discord what scopes the CURRENT token actually has ==="
echo "(uses /oauth2/@me — shows the truth, not our stale scope DB column)"
echo ""
node -e "
async function main() {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  const users = await p.user.findMany({
    where: { role: { in: ['ADMIN', 'STEWARD'] } },
    include: { accounts: { where: { provider: 'discord' }, select: { access_token: true, scope: true } } },
  });
  for (const u of users) {
    const a = u.accounts[0];
    if (!a?.access_token) continue;
    console.log('--- ' + u.firstName + ' ' + u.lastName + ' ---');
    console.log('  DB scope    : ' + a.scope);
    const r = await fetch('https://discord.com/api/oauth2/@me', {
      headers: { Authorization: 'Bearer ' + a.access_token },
    });
    if (!r.ok) {
      console.log('  /oauth2/@me : HTTP ' + r.status);
    } else {
      const d = await r.json();
      console.log('  ACTUAL scope: ' + (d.scopes ? d.scopes.join(' ') : '(no scopes field)'));
      console.log('  expires     : ' + d.expires);
      console.log('  application : ' + (d.application?.name ?? '?'));
    }
  }
  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"

echo ""
echo "=== Step 2: HARD DELETE Discord Account rows for admins/stewards ==="
echo "(your User row + registrations + everything else stays — only the OAuth"
echo " account link is dropped, so the next sign-in is treated as brand-new.)"
echo ""
read -p "Confirm delete? [y/N] " ans
if [ "${ans}" = "y" ] || [ "${ans}" = "Y" ]; then
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.account.deleteMany({
    where: { provider: 'discord', user: { role: { in: ['ADMIN', 'STEWARD'] } } },
  }).then(r => { console.log('Deleted ' + r.count + ' Discord Account row(s).'); return p.\$disconnect(); });
  "
  echo ""
  echo "Sessions are still valid in browser cookies. Force a sign-out:"
  echo "  Open league-manager → click 'Sign out' (or clear cookies for the domain)."
  echo ""
  echo "Then:"
  echo "  1) Open https://discord.com/settings/authorized-apps and remove the app there too."
  echo "  2) Sign in to league-manager → Discord shows fresh consent."
  echo "  3) Re-run the probe script:"
  echo "       bash outputs/probe-andreas-guilds.sh"
  echo ""
  echo "If it STILL shows identify+email after that, we have a Discord-app-side"
  echo "issue and the next step is to check the Discord Developer Portal settings."
else
  echo "Skipped delete."
fi
