#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== All admin / steward users + their Discord scopes ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
async function main() {
  const users = await p.user.findMany({
    where: { role: { in: ['ADMIN', 'STEWARD'] } },
    include: {
      accounts: {
        where: { provider: 'discord' },
        select: { provider: true, scope: true, expires_at: true, providerAccountId: true },
      },
    },
  });
  if (users.length === 0) { console.log('(no admin/steward users)'); return; }
  for (const u of users) {
    console.log('');
    console.log('  User: ' + (u.firstName ?? '?') + ' ' + (u.lastName ?? '?') + ' (' + (u.email ?? '?') + ')');
    console.log('    role                  : ' + u.role);
    console.log('    casDiscordGuildMember : ' + u.casDiscordGuildMember);
    console.log('    iracingMemberId       : ' + (u.iracingMemberId ?? '-'));
    if (u.accounts.length === 0) {
      console.log('    (no Discord account linked)');
    } else {
      for (const a of u.accounts) {
        const exp = a.expires_at ? new Date(a.expires_at * 1000).toISOString() : 'null';
        console.log('    discord scope         : \"' + (a.scope ?? '') + '\"');
        console.log('    expires_at            : ' + exp);
        console.log('    discord user id       : ' + a.providerAccountId);
      }
    }
  }
  await p.\$disconnect();
}
main();
"
