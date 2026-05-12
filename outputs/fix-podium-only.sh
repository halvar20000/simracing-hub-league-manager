#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Anchor specifically on the podium block: lastName followed by startNumber.
// (Other map blocks order fields differently.)
const before =
  "        lastName: sample.registration.user.lastName,\n" +
  "        startNumber: sample.registration.startNumber,";
const after =
  "        lastName: sample.registration.user.lastName,\n" +
  "        countryCode: sample.registration.user.countryCode ?? null,\n" +
  "        startNumber: sample.registration.startNumber,";

if (s.includes(after)) {
  console.log("Already added.");
} else if (!s.includes(before)) {
  console.error("Podium-block anchor not found. Showing context for review:");
  const i = s.indexOf("rank: i + 1");
  if (i >= 0) console.log(s.slice(i, i + 400));
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("countryCode inserted into podium .map() block.");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Round page podium: include countryCode in driver mapping"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
