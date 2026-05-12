#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
if [ -f ".env" ]; then set -a; source .env; set +a; fi

echo "=== auth.ts content (relevant bits) ==="
grep -n -E "Discord|scope|casDiscordGuildMember|guildId|GUILD_ID" src/auth.ts

echo ""
echo "=== Your User row ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.user.findUnique({
  where: { email: 'thomas.herbrig@gmail.com' },
  include: { accounts: { select: { provider: true, scope: true, expires_at: true } } },
}).then(u => {
  if (!u) { console.log('(user not found by email)'); return; }
  console.log('  id                    : ' + u.id);
  console.log('  name                  : ' + u.firstName + ' ' + u.lastName);
  console.log('  casDiscordGuildMember : ' + u.casDiscordGuildMember);
  console.log('  iracingMemberId       : ' + u.iracingMemberId);
  console.log('  Accounts:');
  for (const a of u.accounts) {
    const exp = a.expires_at ? new Date(a.expires_at * 1000).toISOString() : 'null';
    console.log('    provider=' + a.provider + ' scope=\"' + (a.scope ?? '') + '\" expires=' + exp);
  }
  return p.\$disconnect();
});
"

echo ""
echo "=== Env on Vercel side check (local mirror) ==="
echo "  CAS_DISCORD_GUILD_ID  = ${CAS_DISCORD_GUILD_ID:+(set locally — does Vercel have it too?)}"
echo "  CAS_DISCORD_INVITE_URL= ${CAS_DISCORD_INVITE_URL:+(set locally)}"
