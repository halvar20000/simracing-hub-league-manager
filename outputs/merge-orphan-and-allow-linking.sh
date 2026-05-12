#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ===========================================================================
# 1. Move the Discord Account from the orphan Thomas to the real Thomas, then
#    delete the orphan + un-promote any spurious ADMIN role.
# ===========================================================================
echo "=== Merging orphan Thomas → real Thomas ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const ORPHAN_ID = 'cmook0le20000jx049kqvugen';   // the no-name DRIVER->ADMIN row
const REAL_ID   = 'cmoczqq0t000030v4y1yi4e0k';   // thomas.herbrig@icloud.com row
(async () => {
  const orphan = await p.user.findUnique({ where: { id: ORPHAN_ID } });
  const real   = await p.user.findUnique({ where: { id: REAL_ID } });
  if (!orphan) { console.log('  Orphan already cleaned up — skipping.'); }
  if (!real)   { console.error('  Real Thomas user not found — aborting.'); await p.\$disconnect(); return; }

  // Move all Discord Account rows from orphan to real (in case there's more than one).
  if (orphan) {
    const moved = await p.account.updateMany({
      where: { userId: ORPHAN_ID },
      data: { userId: REAL_ID },
    });
    console.log('  Moved ' + moved.count + ' Account row(s) onto real user.');

    // Make sure real user is ADMIN.
    if (real.role !== 'ADMIN') {
      await p.user.update({ where: { id: REAL_ID }, data: { role: 'ADMIN' } });
      console.log('  Re-set real user role to ADMIN.');
    } else {
      console.log('  Real user already ADMIN.');
    }

    // Delete sessions on the orphan (they reference orphan.id).
    const sess = await p.session.deleteMany({ where: { userId: ORPHAN_ID } });
    console.log('  Deleted ' + sess.count + ' Session row(s) on orphan.');

    // Now delete the orphan.
    await p.user.delete({ where: { id: ORPHAN_ID } });
    console.log('  Deleted orphan User row.');
  }

  await p.\$disconnect();
})().catch(e => { console.error(e); process.exit(1); });
"

# ===========================================================================
# 2. Enable Auth.js email-based account linking on the Discord provider so
#    future fresh signins by Andreas (and anyone else) link to existing User
#    rows via email instead of creating orphans.
# ===========================================================================
echo ""
echo "=== Enabling allowDangerousEmailAccountLinking on Discord provider ==="
node -e "
const fs = require('fs');
const FILE = 'src/auth.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('allowDangerousEmailAccountLinking')) {
  console.log('  Already enabled.');
  process.exit(0);
}
s = s.replace(
  'authorization: { params: { scope: \"identify email guilds\", prompt: \"consent\" } }',
  'authorization: { params: { scope: \"identify email guilds\", prompt: \"consent\" } },\n      allowDangerousEmailAccountLinking: true'
);
if (!s.includes('allowDangerousEmailAccountLinking')) {
  // fallback: simpler scope variant
  s = s.replace(
    /scope:\s*\"identify email guilds\",\s*prompt:\s*\"consent\"\s*\}/,
    'scope: \"identify email guilds\", prompt: \"consent\" },\n      allowDangerousEmailAccountLinking: true'
  );
}
fs.writeFileSync(FILE, s);
console.log('  Enabled.');
"

echo ""
echo "=== auth.ts (Discord provider section) ==="
grep -n -A 4 "Discord(" src/auth.ts

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

git add -A
git commit -m "Auth: merge orphan Thomas, enable email-based account linking on Discord provider"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  - Refresh league-manager — your Admin menu is back (role on real user)."
echo "  - Re-run probe to confirm Discord account is now on the right user:"
echo "      bash outputs/probe-andreas-guilds.sh"
echo ""
echo "When Andreas signs in next time:"
echo "  - Discord OAuth provides email = andreas-wuschnakowski@t-online.de."
echo "  - NextAuth finds the existing ADMIN user with that email → links to it."
echo "  - No orphan created, role preserved automatically."
