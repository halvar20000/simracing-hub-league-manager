#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

const before = `      if (notes) fields.push({ name: "Notes", value: notes });`;
const after  = `      if (notes) fields.push({ name: "Notes", value: notes, inline: false });`;

if (s.includes(after)) {
  console.log("Already patched.");
} else if (!s.includes(before)) {
  console.error("Anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Patched: notes field now has inline: false.");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Discord webhook: align notes field with inferred type"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
