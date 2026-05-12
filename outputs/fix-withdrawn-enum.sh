#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== 1. Verify WITHDRAWN is actually in the schema ==="
awk '/^enum IncidentStatus/,/^}/' prisma/schema.prisma

# If it's not there, add it now (idempotent)
if ! grep -q '^  WITHDRAWN$' prisma/schema.prisma; then
  echo ""
  echo "[!] WITHDRAWN missing from schema — adding it now"
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
if (!s.includes(before)) {
  console.error("Could not find IncidentStatus enum to patch.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Added WITHDRAWN to schema.");
EOF
  node outputs-tmp/patch-schema.mjs
  rm -rf outputs-tmp
fi

echo ""
echo "=== 2. Wipe generated Prisma client + caches ==="
rm -rf node_modules/.prisma
rm -rf node_modules/@prisma/client
rm -rf .next

echo ""
echo "=== 3. Reinstall @prisma/client to be sure ==="
npm install @prisma/client --no-audit --no-fund

echo ""
echo "=== 4. Push schema to Neon (idempotent) ==="
npx --yes prisma db push --skip-generate

echo ""
echo "=== 5. Regenerate Prisma client ==="
npx --yes prisma generate

echo ""
echo "=== 6. Sanity check: WITHDRAWN must appear in the generated types ==="
if grep -q "WITHDRAWN" node_modules/.prisma/client/index.d.ts; then
  echo "[OK] WITHDRAWN present in generated client."
else
  echo "[FAIL] WITHDRAWN NOT in generated client. Stopping."
  exit 1
fi

echo ""
echo "=== 7. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# Only commit if tsc was clean
echo ""
echo "=== 8. Commit + push ==="
git add -A
git commit -m "Reports overhaul: ensure WITHDRAWN enum is in generated Prisma client" || echo "(nothing to commit)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
