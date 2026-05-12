#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/nav.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = '<Link href="/" className="block">';
const after  = '<Link href="/" className="flex items-center gap-3">';

if (s.includes(after)) {
  console.log("Already side-by-side.");
} else if (!s.includes(before)) {
  console.error("Anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Logos now side by side (flex items-center gap-3).");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Nav: place site + CAS logos side by side (flex row)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
