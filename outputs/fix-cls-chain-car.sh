#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (/clsRaw\s*===\s*"car"/.test(s)) {
  console.log('Chain already includes "car".');
  process.exit(0);
}

// Insert a `: clsRaw === "car" ? "car"` branch right before `: "combined";`.
const re = /:\s*"combined";/;
if (!re.test(s)) {
  console.error('Could not find `: "combined";` fallback to anchor on.');
  process.exit(1);
}
s = s.replace(re, ': clsRaw === "car" ? "car" : "combined";');
fs.writeFileSync(FILE, s);
console.log('Inserted `clsRaw === "car" ? "car"` branch into the chain.');
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Lines 155–185 (post-fix) ==="
sed -n '155,185p' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Round page: extend cls assignment chain with 'car' branch"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
