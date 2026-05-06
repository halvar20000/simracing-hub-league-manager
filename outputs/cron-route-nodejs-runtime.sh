#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/api/cron/notify-reporting-open/route.ts'

echo "=== Add explicit runtime + maxDuration to cron route ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;
if (s.includes(\"runtime = 'nodejs'\") || s.includes('runtime = \"nodejs\"')) {
  console.log('  Already has runtime declaration.');
  process.exit(0);
}
s = s.replace(
  /export const dynamic = \"force-dynamic\";/,
  \`export const dynamic = \"force-dynamic\";
export const runtime = \"nodejs\";
export const maxDuration = 60;\`
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
head -10 "$FILE"

echo ""
echo "=== Run a local build to see if route is included ==="
npm run build 2>&1 | tail -40 || true

echo ""
echo "=== Check .next output for the route ==="
ls -la .next/server/app/api/cron/notify-reporting-open/ 2>/dev/null || echo "  (route NOT in .next — build is dropping it)"

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Cron route: explicit nodejs runtime + maxDuration so Prisma routes aren't dropped by Edge inference"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then retry the curl. Post back BOTH:"
echo "  • Whether '.next/server/app/api/cron/notify-reporting-open/' exists"
echo "    locally after the build above"
echo "  • The curl result on the production URL"
