#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Use "rank: i + 1" as an anchor unique to the podium block.
const before =
  "        rank: i + 1,\n" +
  "        firstName: sample.registration.user.firstName,\n" +
  "        lastName: sample.registration.user.lastName,\n" +
  "        startNumber: sample.registration.startNumber,";
const after =
  "        rank: i + 1,\n" +
  "        firstName: sample.registration.user.firstName,\n" +
  "        lastName: sample.registration.user.lastName,\n" +
  "        countryCode: sample.registration.user.countryCode ?? null,\n" +
  "        startNumber: sample.registration.startNumber,";

if (s.includes(after)) {
  console.log("Already correct.");
} else if (!s.includes(before)) {
  console.error("Anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Inserted countryCode into podium block (anchored on 'rank: i + 1').");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Round podium: include countryCode in podium block (specific to rank: i+1)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
