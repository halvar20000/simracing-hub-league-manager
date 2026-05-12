#!/usr/bin/env bash
# Widen the inline carClass type on the admin round page so shortCode is in scope.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

mkdir -p outputs-tmp
cat > outputs-tmp/patch-cc-type.mjs <<'EOF'
import fs from "node:fs";
const PAGE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

const before = "carClass: { name: string } | null;";
const after = "carClass: { name: string; shortCode: string } | null;";

if (!s.includes(before)) {
  if (s.includes(after)) {
    console.log("carClass type already widened.");
  } else {
    console.error("Could not find narrow carClass type to widen.");
    process.exit(1);
  }
} else {
  s = s.replace(before, after);
  fs.writeFileSync(PAGE, s);
  console.log("Widened carClass type to include shortCode.");
}
EOF
node outputs-tmp/patch-cc-type.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity check:"
grep -n 'carClass: {' "$PAGE"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin round page: widen inline carClass type to include shortCode"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
