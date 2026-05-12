#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes('import type { Metadata }')) {
  console.log("Metadata import already present.");
} else {
  // Insert at the very top, before the first import line
  const m = s.match(/^import .+$/m);
  if (!m) { console.error("no import lines found"); process.exit(1); }
  s = s.replace(m[0], 'import type { Metadata } from "next";\n' + m[0]);
  fs.writeFileSync(FILE, s);
  console.log("Added Metadata import at top of standings page.");
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity:"
head -5 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

git add -A
git commit -m "Standings page: add missing Metadata type import"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
