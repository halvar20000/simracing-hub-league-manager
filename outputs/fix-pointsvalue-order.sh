#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/admin-reports.ts";
let s = fs.readFileSync(FILE, "utf8");

// Remove the misplaced override block (currently above `if (!publicSummary)`).
const misplaced = `  if (categoryLevel != null) {
    pointsValue = categoryDerivedPoints;
  }
  if (!publicSummary) {`;
const fixed = `  if (!publicSummary) {`;
if (s.includes(misplaced)) {
  s = s.replace(misplaced, fixed);
  console.log("Removed misplaced override block.");
}

// Insert the override AFTER the categoryDerivedPoints declaration.
const declAnchor = `  const categoryDerivedPoints = pointsForLevel(scoringSystemForCat, categoryLevel);`;
const declWithOverride = `  const categoryDerivedPoints = pointsForLevel(scoringSystemForCat, categoryLevel);
  if (categoryLevel != null) {
    pointsValue = categoryDerivedPoints;
  }`;
if (!s.includes("if (categoryLevel != null) {\n    pointsValue = categoryDerivedPoints;")) {
  if (!s.includes(declAnchor)) { console.error("declAnchor not found."); process.exit(1); }
  s = s.replace(declAnchor, declWithOverride);
  console.log("Inserted override after declaration.");
}

fs.writeFileSync(FILE, s);
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
git commit -m "Penalty categories: move pointsValue override after categoryDerivedPoints declaration"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
