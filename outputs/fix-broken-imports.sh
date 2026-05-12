#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/fix.mjs <<'EOF'
import fs from "node:fs";

const FILES = [
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx",
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx",
];

const IMPORT_LINE = 'import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";';

for (const FILE of FILES) {
  let s = fs.readFileSync(FILE, "utf8");

  // 1. Remove ANY misplaced/duplicate SubmitWithSpinner import lines.
  s = s
    .split("\n")
    .filter((line) => line.trim() !== IMPORT_LINE.trim())
    .join("\n");

  // 2. Re-insert AFTER the last line that contains `from "` (covers both
  //    single-line and multi-line `import { ... } from "..."` statements).
  const lines = s.split("\n");
  let lastFrom = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\bfrom\s+["']/.test(lines[i])) lastFrom = i;
  }
  if (lastFrom === -1) {
    console.error(`[${FILE}] no import line found.`);
    continue;
  }
  lines.splice(lastFrom + 1, 0, IMPORT_LINE);
  fs.writeFileSync(FILE, lines.join("\n"));
  console.log(`[${FILE}] cleaned + import re-inserted at line ${lastFrom + 2}.`);
}
EOF
node outputs-tmp/fix.mjs
rm -rf outputs-tmp

echo ""
echo "=== Header of penalty-pool page (sanity) ==="
head -15 'src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'
echo ""
echo "=== Header of report detail page (sanity) ==="
head -15 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Fix: SubmitWithSpinner import was being injected mid-multi-line-import — anchor on 'from \"' instead"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
