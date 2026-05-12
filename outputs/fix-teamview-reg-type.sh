#!/usr/bin/env bash
# Add excludedAt to the TeamView's narrower registration type in the public
# round page. ResultsTable's broader type was already widened — TeamView's
# wasn't because it has no `team:` field for the regex anchor to land on.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-teamview-reg.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// TeamView's registration type uses 8-space indentation. ResultsTable's uses
// 6-space. We match on the 8-space variant (no `team:` field — that's the
// distinguishing feature) so we only touch TeamView.
const before =
  "        user: { firstName: string | null; lastName: string | null };\n" +
  "        carClass: { name: string } | null;\n" +
  "      };";
const after =
  "        user: { firstName: string | null; lastName: string | null };\n" +
  "        carClass: { name: string } | null;\n" +
  "        excludedAt: Date | null;\n" +
  "      };";

if (s.includes("        excludedAt: Date | null;\n      };")) {
  console.log("TeamView reg type already widened.");
} else if (!s.includes(before)) {
  console.error("Could not find TeamView registration type anchor.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("TeamView reg type widened with excludedAt.");
}
EOF
node outputs-tmp/patch-teamview-reg.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity — count of excludedAt references in the public round page (expect >= 4):"
grep -c 'excludedAt' \
  'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: widen TeamView reg type with excludedAt"
git push

echo ""
echo "Done. Wait ~60s for Vercel — build should now go green."
