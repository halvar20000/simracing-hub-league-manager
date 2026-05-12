#!/usr/bin/env bash
# Add "scripts" to tsconfig.json exclude so diagnostic .ts scripts don't
# collide on global names during the Vercel build.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-tsconfig.mjs <<'EOF'
import fs from "node:fs";
const path = "tsconfig.json";
const raw = fs.readFileSync(path, "utf8");
// JSON with comments? Next.js sometimes uses plain JSON; try JSON first.
let data;
try {
  data = JSON.parse(raw);
} catch {
  // Strip // comments and trailing commas if present
  const stripped = raw
    .replace(/\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/,(\s*[\]}])/g, "$1");
  data = JSON.parse(stripped);
}
data.exclude = Array.isArray(data.exclude) ? data.exclude : [];
const want = ["node_modules", "scripts"];
let changed = false;
for (const w of want) {
  if (!data.exclude.includes(w)) {
    data.exclude.push(w);
    changed = true;
  }
}
if (!changed) {
  console.log("tsconfig.json already excludes scripts.");
} else {
  fs.writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
  console.log("Updated tsconfig.json exclude:", data.exclude);
}
EOF
node outputs-tmp/patch-tsconfig.mjs
rm -rf outputs-tmp

echo ""
echo "Current exclude in tsconfig.json:"
grep -A 5 '"exclude"' tsconfig.json || echo "  (no exclude block — JSON shape may be unusual)"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "tsconfig: exclude scripts/ from build to avoid global redeclarations"
git push

echo ""
echo "Done. Wait ~60s for Vercel and confirm the build goes green."
