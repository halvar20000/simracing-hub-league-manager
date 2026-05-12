#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace every plain "{r.driverFirstName} {r.driverLastName}" with a version
// that has <CountryFlag code={r.countryCode} /> in front. Only replaces
// occurrences that aren't already wrapped (i.e., no preceding CountryFlag).
const oldText = "{r.driverFirstName} {r.driverLastName}";
const newText =
  '<CountryFlag code={r.countryCode} />{r.driverFirstName} {r.driverLastName}';

let count = 0;
let lastIdx = -1;
while (true) {
  const idx = s.indexOf(oldText, lastIdx + 1);
  if (idx < 0) break;
  // Skip if already preceded by CountryFlag (don't double-wrap)
  const ctxBefore = s.slice(Math.max(0, idx - 60), idx);
  if (ctxBefore.includes("<CountryFlag code={r.countryCode}")) {
    lastIdx = idx;
    continue;
  }
  s = s.slice(0, idx) + newText + s.slice(idx + oldText.length);
  count++;
  lastIdx = idx + newText.length;
}
console.log(`Wrapped ${count} occurrence(s) with CountryFlag.`);
fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Sanity ==="
grep -n 'CountryFlag\|driverFirstName' \
  'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' | head -10

echo ""
git add -A
git commit -m "Standings: add CountryFlag in driver name cells (List + Race-by-race)"
git push

echo ""
echo "Done. Wait ~60s for Vercel and hard-reload (Cmd+Shift+R)."
