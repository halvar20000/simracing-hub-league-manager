#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
  '                    {league._count.seasons} season\n' +
  '                    {league._count.seasons === 1 ? "" : "s"}\n' +
  '                    {activeSeason && ` • ${activeSeason.year}`}';
const after =
  '                    {league._count.seasons} season\n' +
  '                    {league._count.seasons === 1 ? "" : "s"}';

if (!s.includes(before)) {
  if (!s.includes("activeSeason &&")) {
    console.log("Already cleaned up.");
    process.exit(0);
  }
  console.error("Anchor not found.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Removed year from admin page season-count text.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Admin: drop year from league tile season count (consistent N season(s))"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
