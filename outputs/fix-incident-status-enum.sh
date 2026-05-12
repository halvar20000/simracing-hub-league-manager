#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Add WITHDRAWN to the IncidentStatus enum SPECIFICALLY
#    (My earlier check matched WITHDRAWN in RegistrationStatus, false positive.)
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");

const before = `enum IncidentStatus {
  SUBMITTED
  UNDER_REVIEW
  DECIDED
  DISMISSED
}`;
const after = `enum IncidentStatus {
  SUBMITTED
  UNDER_REVIEW
  DECIDED
  DISMISSED
  WITHDRAWN
}`;

if (s.includes(after)) {
  console.log("IncidentStatus already has WITHDRAWN.");
} else if (!s.includes(before)) {
  console.error("IncidentStatus enum anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Added WITHDRAWN to IncidentStatus.");
}
EOF
node outputs-tmp/patch-schema.mjs
rm -rf outputs-tmp

# ---------------------------------------------------------------------------
# 2. Show the updated enum (proof)
# ---------------------------------------------------------------------------
echo ""
echo "=== Updated IncidentStatus enum ==="
awk '/^enum IncidentStatus/,/^}/' prisma/schema.prisma

# ---------------------------------------------------------------------------
# 3. Push schema to Neon (adds enum value)
# ---------------------------------------------------------------------------
echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate

# ---------------------------------------------------------------------------
# 4. Wipe generated client + tsbuildinfo + .next so nothing is cached
# ---------------------------------------------------------------------------
echo ""
echo "=== Clearing caches ==="
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund

# ---------------------------------------------------------------------------
# 5. Regenerate client
# ---------------------------------------------------------------------------
echo ""
echo "=== prisma generate ==="
npx --yes prisma generate

# ---------------------------------------------------------------------------
# 6. STRONG check: WITHDRAWN must appear in the IncidentStatus const
# ---------------------------------------------------------------------------
echo ""
echo "=== Verifying generated IncidentStatus const ==="
if grep -A 6 'export const IncidentStatus:' node_modules/.prisma/client/index.d.ts \
   | grep -q 'WITHDRAWN'; then
  echo "[OK] IncidentStatus.WITHDRAWN is in generated client."
else
  echo "[FAIL] IncidentStatus generated client still missing WITHDRAWN. Dump:"
  grep -A 6 'export const IncidentStatus:' node_modules/.prisma/client/index.d.ts | head -20
  exit 1
fi

# ---------------------------------------------------------------------------
# 7. Type-check
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 8. Commit + push
# ---------------------------------------------------------------------------
echo ""
git add -A
git commit -m "Reports: actually add WITHDRAWN to IncidentStatus enum" || echo "(nothing to commit)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
