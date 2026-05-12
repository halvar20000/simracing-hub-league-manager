#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

if (/^\s*casDiscordGuildMember\s+Boolean/m.test(s)) {
  console.log("Field already in schema.");
  process.exit(0);
}

const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+User\s*\{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^\}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) {
  console.error("Could not locate User model closing brace.");
  process.exit(1);
}
lines.splice(close, 0, "  casDiscordGuildMember Boolean   @default(false)");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Inserted casDiscordGuildMember at line " + (close + 1));
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== User model in schema (post-patch) ==="
awk '/^model User /,/^}/' prisma/schema.prisma | tail -10

echo ""
echo "=== Push schema + regenerate ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

echo ""
echo "=== Verify column exists ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const rows = await p.\$queryRawUnsafe('SELECT id, email, \"casDiscordGuildMember\" FROM \"User\" LIMIT 3');
  console.log(JSON.stringify(rows, null, 2));
  await p.\$disconnect();
})();
"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Schema: actually add User.casDiscordGuildMember (previous patch never applied)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Next: revoke league-manager at https://discord.com/settings/authorized-apps"
echo "      then sign in again."
