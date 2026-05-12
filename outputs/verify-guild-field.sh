#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Schema check: casDiscordGuildMember in User model? ==="
awk '/^model User/,/^}/' prisma/schema.prisma | grep -E "casDiscordGuildMember|^model User" || echo "(field MISSING from schema!)"

echo ""
echo "=== Force-regenerate Prisma client ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

echo ""
echo "=== Verify field is in generated types ==="
if grep -q "casDiscordGuildMember" node_modules/.prisma/client/index.d.ts; then
  echo "[OK] casDiscordGuildMember in generated client."
else
  echo "[FAIL] field NOT in generated client. Re-running db push to add column."
  npx --yes prisma db push --skip-generate
  npx --yes prisma generate
fi

echo ""
echo "=== Verify column exists in DB (via raw select) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  try {
    const rows = await p.\$queryRawUnsafe(\`SELECT id, email, \"casDiscordGuildMember\" FROM \"User\" LIMIT 3\`);
    console.log(JSON.stringify(rows, null, 2));
  } catch (e) {
    console.error('  Raw query failed:', e instanceof Error ? e.message : String(e));
  }
  await p.\$disconnect();
})();
"

echo ""
echo "=== Re-fetch admin users (new client) ==="
node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const users = await p.user.findMany({
    where: { role: { in: ['ADMIN', 'STEWARD'] } },
    select: { id: true, email: true, role: true, casDiscordGuildMember: true },
  });
  for (const u of users) {
    console.log('  ' + (u.email ?? u.id) + ' role=' + u.role + ' casDiscordGuildMember=' + u.casDiscordGuildMember);
  }
  await p.\$disconnect();
})();
"
