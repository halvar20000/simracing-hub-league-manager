#!/usr/bin/env bash
# Fix: standings.ts uses `result` (singular) in this branch, not `results`.
# Replace the rCorrection declaration to match.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  "      const rCorrection = results.reduce(\n        (sum, r) => sum + r.correctionPoints,\n        0\n      );";
const after = "      const rCorrection = result.correctionPoints;";

if (s.includes(after)) {
  console.log("Already fixed.");
} else if (!s.includes(before)) {
  console.error("Could not find the bad rCorrection declaration.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Fixed: rCorrection now uses result.correctionPoints (singular).");
}
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "Confirm:"
grep -n 'const rCorrection\|rPart\|rPen' src/lib/standings.ts | head -10

echo ""
git add -A
git commit -m "standings: rCorrection uses result.correctionPoints (singular branch)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
