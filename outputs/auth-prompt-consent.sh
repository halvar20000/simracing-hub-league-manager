#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/auth.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes('prompt: "consent"')) { console.log("prompt:consent already set."); process.exit(0); }

const re = /scope:\s*"identify guilds"\s*\}/;
if (!re.test(s)) {
  console.error("Could not find scope param.");
  process.exit(1);
}
s = s.replace(re, 'scope: "identify guilds", prompt: "consent" }');
fs.writeFileSync(FILE, s);
console.log("Added prompt:consent to Discord provider params.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== auth.ts (provider params) ==="
grep -n "scope\|prompt\|Discord(" src/auth.ts

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# Also: clear stale Account rows so the next sign-in does a fresh linkAccount
echo ""
read -p "Wipe Discord Account rows for both admins so next sign-in is treated as fresh? [y/N] " ans
if [ "${ans}" = "y" ] || [ "${ans}" = "Y" ]; then
  node -e "
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  p.account.deleteMany({
    where: {
      provider: 'discord',
      user: { role: { in: ['ADMIN', 'STEWARD'] } },
    },
  }).then(r => { console.log('Deleted ' + r.count + ' Discord Account row(s).'); return p.\$disconnect(); });
  "
fi

git add -A
git commit -m "Auth: force Discord OAuth consent screen so the new guilds scope is actually granted"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then to test:"
echo "  1) Sign out of league-manager."
echo "  2) Sign in with Discord — the consent screen WILL show this time, with"
echo "     'See your list of Discord servers' as a permission. Approve."
echo "  3) Re-run the diag — discord scope should now be 'identify guilds' and"
echo "     casDiscordGuildMember should be true (assuming you're in CAS Discord)."
