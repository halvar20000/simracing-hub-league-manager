#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '                  {league._count.seasons} season\n' +
  '                  {league._count.seasons === 1 ? "" : "s"}\n' +
  '                  {activeSeason && ` • ${activeSeason.year}`}';
const after =
  '                  {league._count.seasons} season\n' +
  '                  {league._count.seasons === 1 ? "" : "s"}';

if (!s.includes(before)) {
  if (!s.includes("activeSeason &&")) {
    console.log("Already cleaned up.");
    process.exit(0);
  }
  console.error("Anchor not found — please inspect manually.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Removed the year from the season-count line.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Leagues page: drop year from season-count text (consistent N season(s))"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
