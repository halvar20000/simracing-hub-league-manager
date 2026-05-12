#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/iracing-json-import.ts";
let s = fs.readFileSync(FILE, "utf8");

// Remove the bogus 'createdAt' orderBy on CarClass.findFirst.
const before = `  let carClass = await prisma.carClass.findFirst({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" } as never],
  });`;
const after = `  let carClass = await prisma.carClass.findFirst({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });`;

if (s.includes('{ name: "asc" }') && !s.includes('{ createdAt: "asc" }')) {
  console.log("Already patched.");
} else if (!s.includes(before)) {
  console.error("Anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Patched: orderBy now uses displayOrder + name.");
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
git commit -m "iRacing JSON importer: fix CarClass.findFirst orderBy (CarClass has no createdAt — use name as tiebreak)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
