#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: add createdAt + updatedAt + registrations[] to Team
# ============================================================================
echo "=== 1. Patch Team model ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

const re = /(model Team \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  Team model not found.'); process.exit(1); }

let body = m[1];
let added = false;

if (!/\n\s+registrations\s+Registration\[\]/.test(body)) {
  body += '\n  registrations Registration[]';
  added = true;
}
if (!/\n\s+createdAt\s+DateTime/.test(body)) {
  body += '\n  createdAt     DateTime @default(now())';
  added = true;
}
if (!/\n\s+updatedAt\s+DateTime/.test(body)) {
  body += '\n  updatedAt     DateTime @default(now()) @updatedAt';
  added = true;
}

if (added) {
  s = s.replace(re, body + m[2]);
  fs.writeFileSync(FILE, s);
  console.log('  Patched Team model.');
} else {
  console.log('  Already up to date.');
}
"

echo ""
echo "-- Verify Team model --"
awk '/^model Team \{/,/^\}/' prisma/schema.prisma

# ============================================================================
# 2. db push + generate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Schema: add Team.createdAt + Team.updatedAt + Team.registrations back-relation (needed by team-grouped roster)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After this, the team-grouped roster code from Phase 2c should compile"
echo "and the public + admin views render the team-grouped table for IEC."
