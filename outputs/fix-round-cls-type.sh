#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PG='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo "=== Probe: Cls type definition + cls assignment chain ==="
grep -n -E '^type Cls|const cls\s*[:=]' "$PG" | head -20
echo ""
echo "=== Lines 380–395 (where the error is) ==="
sed -n '380,395p' "$PG"
echo ""

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Force the Cls type to include "car" by direct regex.
const reCls = /^type\s+Cls\s*=\s*[^;]+;/m;
const m = s.match(reCls);
if (!m) {
  console.error("Cls type definition not found.");
  process.exit(1);
}
const current = m[0];
if (!/"car"/.test(current)) {
  const updated = current.replace(/;\s*$/, ' | "car";');
  s = s.replace(current, updated);
  console.log("Cls type updated:");
  console.log("  before: " + current);
  console.log("  after : " + updated);
} else {
  console.log("Cls type already includes \"car\".");
}

// Also widen the cls assignment chain if missing.
if (!s.includes('clsRaw === "car"')) {
  const chainRe = /clsRaw === "team" \? "team" :/;
  if (chainRe.test(s)) {
    s = s.replace(chainRe, `clsRaw === "team" ? "team" :\n    clsRaw === "car" ? "car" :`);
    console.log('cls assignment chain: added "car" branch.');
  } else {
    console.log('cls assignment chain: anchor not found (chain may already be widened).');
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Cls type after fix ==="
grep -n '^type Cls' "$PG"
echo ""

echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Round page: force-extend Cls type to include 'car'"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
