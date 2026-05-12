#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Insert countryCode after lastName line in the podium .map(...) callback.
// Anchor: "lastName: sample.registration.user.lastName,"
const before = "lastName: sample.registration.user.lastName,";
const after =
  "lastName: sample.registration.user.lastName,\n        countryCode: sample.registration.user.countryCode ?? null,";
// Only replace one occurrence (the podium one — there's only one in this file)
if (!s.includes("countryCode: sample.registration.user.countryCode ?? null,")) {
  if (!s.includes(before)) {
    console.error("anchor missing");
    process.exit(1);
  }
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Inserted countryCode in podium driver mapping.");
} else {
  console.log("Already present.");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Round page: pass countryCode in podium driver mapping"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
