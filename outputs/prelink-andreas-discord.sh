#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

const ANDREAS_DISCORD_ID = '840621724998303785';
// His existing ADMIN user row (from your earlier listing).
const ANDREAS_USER_ID    = 'cmoh9ptgs0000kw04vssm1ymg';

(async () => {
  const real = await p.user.findUnique({ where: { id: ANDREAS_USER_ID } });
  if (!real) { console.error('Andreas user row not found.'); process.exit(1); }
  if (real.role !== 'ADMIN') {
    await p.user.update({ where: { id: ANDREAS_USER_ID }, data: { role: 'ADMIN' } });
    console.log('Set role=ADMIN on Andreas user.');
  } else {
    console.log('Andreas user already ADMIN.');
  }

  // Make sure no other Account already claims this Discord ID.
  const existing = await p.account.findFirst({
    where: { provider: 'discord', providerAccountId: ANDREAS_DISCORD_ID },
  });
  if (existing) {
    if (existing.userId !== ANDREAS_USER_ID) {
      await p.account.update({
        where: { id: existing.id },
        data: { userId: ANDREAS_USER_ID },
      });
      console.log('Re-pointed existing Discord Account to Andreas user.');
    } else {
      console.log('Account already linked to Andreas user.');
    }
  } else {
    await p.account.create({
      data: {
        userId: ANDREAS_USER_ID,
        type: 'oauth',
        provider: 'discord',
        providerAccountId: ANDREAS_DISCORD_ID,
        // Tokens left blank — NextAuth fills them in on next sign-in.
      },
    });
    console.log('Created Discord Account row for Andreas (tokens will populate on next sign-in).');
  }

  console.log('');
  console.log('Final state:');
  const rows = await p.user.findMany({
    where: { id: ANDREAS_USER_ID },
    include: { accounts: { where: { provider: 'discord' }, select: { providerAccountId: true } } },
  });
  for (const u of rows) {
    console.log('  ' + u.firstName + ' ' + u.lastName + ' role=' + u.role + ' email=' + u.email + ' discord=' + (u.accounts.map(a => a.providerAccountId).join(',') || '-'));
  }
  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"
