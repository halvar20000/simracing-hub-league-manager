#!/usr/bin/env bash
# Move the rCorrection declaration out of the `if (proAmEnabled)` block so
# it's in the same scope as rRaw / rPart / rPen.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// Match the broken block exactly as it currently is on disk.
const before =
`      const rPen = result.manualPenaltyPoints;
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        const classPos = classPositionByResult.get(result.id);
      const rCorrection = result.correctionPoints;
        if (classPos != null) {
          rClassRaw = pointsTable[String(classPos)] ?? 0;
        }
      }`;

const after =
`      const rPen = result.manualPenaltyPoints;
      const rCorrection = result.correctionPoints;
      let rClassRaw = rRaw;
      if (proAmEnabled) {
        const classPos = classPositionByResult.get(result.id);
        if (classPos != null) {
          rClassRaw = pointsTable[String(classPos)] ?? 0;
        }
      }`;

if (s.includes(after) && !s.includes(before)) {
  console.log("Already moved.");
} else if (!s.includes(before)) {
  console.error("Could not find the broken block.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Moved rCorrection declaration to outer scope.");
}
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "Confirm scope:"
sed -n '203,215p' src/lib/standings.ts

echo ""
git add -A
git commit -m "standings: move rCorrection declaration out of if(proAmEnabled) block"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
