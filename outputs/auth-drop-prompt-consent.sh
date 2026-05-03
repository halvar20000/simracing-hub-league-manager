#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. auth.ts: remove `prompt: "consent"` from the Discord OAuth params
# ---------------------------------------------------------------------------
echo "=== 1. Drop prompt:consent from auth.ts ==="
node -e "
const fs = require('fs');
const FILE = 'src/auth.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /authorization:\s*\{\s*params:\s*\{\s*scope:\s*\"identify email guilds\",\s*prompt:\s*\"consent\"\s*\}\s*\}/,
  'authorization: { params: { scope: \"identify email guilds\" } }'
);
if (s === before) {
  console.error('  Anchor not found — auth.ts may have been edited.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'authorization:' src/auth.ts

# ---------------------------------------------------------------------------
# 2. Drop Andreas's stub Account row so his next signin re-creates a fresh
#    one with proper tokens / scope / expires_at. His User + Sessions are
#    untouched. With allowDangerousEmailAccountLinking, NextAuth will link the
#    new Account back to the same User by email automatically.
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Delete Andreas's stub Account row ==="
cat > ./_drop_andreas_account.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
const ANDREAS_DISCORD_ID = '840621724998303785';
(async () => {
  const acc = await p.account.findFirst({
    where: { provider: 'discord', providerAccountId: ANDREAS_DISCORD_ID },
  });
  if (!acc) { console.log('  No Discord Account row found for Andreas — already clean.'); }
  else {
    console.log('  Before delete: scope=' + acc.scope + ' access_tok=' + (acc.access_token ? 'yes' : 'NO') + ' refresh_tok=' + (acc.refresh_token ? 'yes' : 'NO'));
    await p.account.delete({ where: { id: acc.id } });
    console.log('  Deleted.');
  }
  await p.$disconnect();
})();
JS
node ./_drop_andreas_account.cjs
rm ./_drop_andreas_account.cjs

# ---------------------------------------------------------------------------
# 3. TS check
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 4. Commit + push
# ---------------------------------------------------------------------------
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Auth: drop prompt:consent so returning users skip the Discord authorize screen"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "What changes for Andreas:"
echo "  • Next signin will not show the Discord 'Authorize' screen — Discord"
echo "    recognises him and redirects straight through."
echo "  • The signin will create a fresh Account row with real tokens/scopes,"
echo "    so his guildMember flag will be set correctly if he's in CAS."
echo ""
echo "What does NOT change:"
echo "  • If his iPhone browser keeps clearing the session cookie, he'll still"
echo "    have to click 'Sign in with Discord' on each visit — but it'll be a"
echo "    one-click redirect, not a full authorize-and-consent dance."
echo ""
echo "Existing sessions (Andreas + Thomas) are NOT invalidated — they still"
echo "work until they expire normally."
