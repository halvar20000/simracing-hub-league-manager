#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-prisma-null.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/scoring-systems.ts";
let s = fs.readFileSync(FILE, "utf8");

// Replace the null-handling line with Prisma.DbNull-aware version
const before =
  "      classPointsTable: classPointsTable === null ? null : classPointsTable,";
const after =
  "      classPointsTable:\n        classPointsTable === null\n          ? Prisma.DbNull\n          : classPointsTable,";
if (s.includes("Prisma.DbNull")) {
  console.log("Already uses Prisma.DbNull.");
} else {
  if (!s.includes(before)) {
    console.error("Could not find anchor.");
    process.exit(1);
  }
  s = s.replace(before, after);
  // Make sure Prisma is imported
  if (!/import\s+\{\s*Prisma\s*\}\s+from\s+["']@prisma\/client["']/.test(s)) {
    s = s.replace(
      'import { prisma } from "@/lib/prisma";',
      'import { Prisma } from "@prisma/client";\nimport { prisma } from "@/lib/prisma";'
    );
    console.log("Added Prisma import.");
  }
  fs.writeFileSync(FILE, s);
  console.log("Fixed classPointsTable null handling.");
}
EOF
node outputs-tmp/patch-prisma-null.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity:"
grep -n 'Prisma.DbNull\|classPointsTable' src/lib/actions/scoring-systems.ts | head -5

echo ""
git add -A
git commit -m "Scoring systems action: use Prisma.DbNull for nullable Json field"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
