#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== All users + their Discord account IDs ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    include: { accounts: { where: { provider: 'discord' }, select: { providerAccountId: true } } },
    orderBy: { createdAt: 'desc' },
  });
  for (const u of users) {
    const acc = u.accounts.map(a => a.providerAccountId).join(',') || '(no discord)';
    console.log('  ' + u.id + ' | role=' + u.role.padEnd(7) + ' | ' + (u.firstName ?? '?') + ' ' + (u.lastName ?? '?') + ' | email=' + (u.email ?? '-') + ' | discord=' + acc + ' | created=' + u.createdAt.toISOString());
  }
  await p.\$disconnect();
})();
"

echo ""
echo "=== Re-promote ADMIN by Discord IDs (Thomas + Andreas) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const DISCORD_IDS = ['734755738009993248', '840621724998303785'];  // Thomas, Andreas
(async () => {
  for (const did of DISCORD_IDS) {
    const acc = await p.account.findFirst({
      where: { provider: 'discord', providerAccountId: did },
      include: { user: true },
    });
    if (!acc) { console.log('  ' + did + ' — no Discord account linked'); continue; }
    if (acc.user.role === 'ADMIN') { console.log('  ' + did + ' — already ADMIN (' + acc.user.firstName + ' ' + acc.user.lastName + ')'); continue; }
    await p.user.update({ where: { id: acc.userId }, data: { role: 'ADMIN' } });
    console.log('  ' + did + ' — promoted to ADMIN (' + acc.user.firstName + ' ' + acc.user.lastName + ')');
  }
  await p.\$disconnect();
})();
"

echo ""
echo "=== Add 'email' back to the Discord OAuth scope ==="
node -e "
const fs = require('fs');
const FILE = 'src/auth.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('\"identify email guilds\"')) { console.log('  Already updated.'); process.exit(0); }
const re = /scope:\s*\"identify guilds\"/;
if (!re.test(s)) { console.error('  Could not find scope param.'); process.exit(1); }
s = s.replace(re, 'scope: \"identify email guilds\"');
fs.writeFileSync(FILE, s);
console.log('  Scope updated to \"identify email guilds\".');
"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Auth: keep 'email' in scope so NextAuth can still link by email; restore admin role"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Refresh league-manager — Admin menu should be back since the role's restored."
echo "Future sign-ins will request identify+email+guilds and link cleanly."
