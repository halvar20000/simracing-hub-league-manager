#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f ".env" ]; then set -a; source .env; set +a; fi

node -e "
async function main() {
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();

  // Pull both admin users + their Discord access tokens.
  const users = await p.user.findMany({
    where: { role: { in: ['ADMIN', 'STEWARD'] } },
    include: {
      accounts: { where: { provider: 'discord' }, select: { access_token: true, scope: true, expires_at: true } },
    },
  });

  for (const u of users) {
    const a = u.accounts[0];
    if (!a?.access_token) {
      console.log(u.firstName + ' ' + u.lastName + ' — no Discord account / token');
      continue;
    }
    console.log('');
    console.log('--- ' + u.firstName + ' ' + u.lastName + ' ---');
    console.log('  stored scope: ' + a.scope);
    console.log('  expires_at  : ' + (a.expires_at ? new Date(a.expires_at*1000).toISOString() : 'n/a'));
    console.log('  cas member  : ' + u.casDiscordGuildMember);

    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: 'Bearer ' + a.access_token },
    });
    console.log('  /guilds → HTTP ' + guildsRes.status);
    if (!guildsRes.ok) {
      console.log('  body: ' + (await guildsRes.text()).slice(0, 300));
    } else {
      const guilds = await guildsRes.json();
      const arr = Array.isArray(guilds) ? guilds : [];
      console.log('  ' + arr.length + ' guild(s):');
      for (const g of arr) console.log('    id=' + g.id + ' name=\"' + g.name + '\"');
      const target = process.env.CAS_DISCORD_GUILD_ID;
      console.log('');
      console.log('  CAS_DISCORD_GUILD_ID (local) : ' + (target || '(not set locally)'));
      if (target) {
        const isMember = arr.some(g => g.id === target);
        console.log('  membership match? ' + (isMember ? 'YES ✓' : 'NO ✗'));
      } else {
        console.log('  (set CAS_DISCORD_GUILD_ID locally to test the match here)');
      }
    }
  }

  await p.\$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
"
