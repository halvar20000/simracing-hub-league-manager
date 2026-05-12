#!/usr/bin/env bash
# Fix the upsert key + create payload in irlm-import.ts to use the dynamic
# `raceNumber` parameter (rather than the hard-coded `1` from Phase 1).
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-importer-rn.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/irlm-import.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Replace any `raceNumber: 1` inside the upsert WHERE clause with
//     `raceNumber` (using the dynamic parameter that's now in scope).
//     Make the regex flexible about whitespace.
const reKey = /(roundId_registrationId_raceNumber:\s*\{\s*roundId,\s*registrationId:\s*reg\.id\s*,\s*)raceNumber:\s*1(\s*\})/;
const m = s.match(reKey);
if (m) {
  s = s.replace(reKey, "$1raceNumber$2");
  console.log("Upsert key now uses dynamic raceNumber.");
} else if (/roundId_registrationId_raceNumber:\s*\{[^}]*raceNumber\s*\}/.test(s)) {
  console.log("Upsert key already dynamic.");
} else {
  console.error("Could not find upsert key block.");
  process.exit(1);
}

// (b) Make sure raceNumber is in the `create` payload of the upsert.
//     Anchor: the line before `finishStatus,` inside the create object.
const createBefore =
  "    create: {\n      roundId,\n      registrationId: reg.id,\n      finishStatus,";
const createAfter =
  "    create: {\n      roundId,\n      registrationId: reg.id,\n      raceNumber,\n      finishStatus,";
if (s.includes("registrationId: reg.id,\n      raceNumber,\n      finishStatus")) {
  console.log("create payload already has raceNumber.");
} else if (!s.includes(createBefore)) {
  console.error("create payload anchor not found.");
  process.exit(1);
} else {
  s = s.replace(createBefore, createAfter);
  console.log("create payload now includes raceNumber.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-importer-rn.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity:"
grep -n 'raceNumber\|roundId_registrationId_raceNumber' src/lib/actions/irlm-import.ts | head -20

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "iRLM importer: use dynamic raceNumber in upsert key + create payload"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
