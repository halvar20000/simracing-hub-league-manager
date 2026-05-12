#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Lines around rPen declaration in standings.ts ==="
grep -n 'const rPen\|const rRaw\|const rPart\|const rCorrection' src/lib/standings.ts

echo ""
echo "=== 25 lines around the first rPen reference ==="
LINE=$(grep -n 'const rPen' src/lib/standings.ts | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE - 5))
  END=$((LINE + 20))
  sed -n "${START},${END}p" src/lib/standings.ts
fi

echo ""
echo "=== Patch: add rCorrection sum right after rPen ==="
mkdir -p outputs-tmp
cat > outputs-tmp/fix-rcorr.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("const rCorrection")) {
  console.log("rCorrection already declared.");
  process.exit(0);
}

// Find the rPen declaration end position. Strategy: locate the first
// occurrence of `const rPen` and find the closing `);` that ends its expression.
const idx = s.indexOf("const rPen");
if (idx < 0) {
  console.error("rPen declaration not found.");
  process.exit(1);
}
// Find the next ');' followed by a newline after idx.
const closeIdx = s.indexOf(");", idx);
if (closeIdx < 0) {
  console.error("rPen close not found.");
  process.exit(1);
}
// Insert rCorrection declaration after that line.
const insertAt = closeIdx + 2; // past ");"
const insertion =
  "\n      const rCorrection = results.reduce(\n        (sum, r) => sum + r.correctionPoints,\n        0\n      );";
s = s.slice(0, insertAt) + insertion + s.slice(insertAt);
fs.writeFileSync(FILE, s);
console.log("Inserted rCorrection declaration after rPen.");
EOF
node outputs-tmp/fix-rcorr.mjs
rm -rf outputs-tmp

echo ""
echo "Confirm the new declaration:"
grep -n 'const rCorrection\|const rPen' src/lib/standings.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "standings: declare rCorrection accumulator before using it"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
