#!/usr/bin/env bash
# Fix: import only the first EventResult (the COMBINED scoring) — that's
# the one with overall positions 1..N. Per-class views just filter+renumber.
# Also: revert the misleading bestLapTimeMs tie-breaker in the public round
# page Combined view; it can now sort by plain finishPosition again.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts

cat > scripts/patch-combined-import.mjs <<'PATCH_EOF'
import fs from "node:fs";

// ---------------------------------------------------------------
// 1. Patch irlm-import.ts — iterate only eventResults[0]
// ---------------------------------------------------------------
const IMPORT = "src/lib/actions/irlm-import.ts";
let s = fs.readFileSync(IMPORT, "utf8");

// Replace the outer `for (const eventResult of eventResults)` loop with a
// single iteration over eventResults[0]. We rely on the very specific text
// of the loop opening to make the patch idempotent and safe.
const before = "for (const eventResult of eventResults) {";
const after = `// iRLM returns multiple EventResults (Combined, Pro, Am, Team).
  // We use only the first one — the COMBINED scoring — which has true
  // overall positions 1..N. Per-class views filter+renumber on render.
  const combinedEventResult = eventResults[0];
  for (const eventResult of combinedEventResult ? [combinedEventResult] : []) {`;

if (s.includes("const combinedEventResult = eventResults[0];")) {
  console.log("irlm-import.ts: already uses eventResults[0] only.");
} else {
  if (!s.includes(before)) {
    console.error("Could not find iRLM event results loop anchor.");
    process.exit(1);
  }
  s = s.replace(before, after);
  fs.writeFileSync(IMPORT, s);
  console.log("irlm-import.ts: now imports COMBINED scoring only.");
}

// ---------------------------------------------------------------
// 2. Patch public round page — revert combined sort to plain order.
// ---------------------------------------------------------------
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let p = fs.readFileSync(PAGE, "utf8");

// Replace `rows={sortByOverall(allRows)}` with `rows={allRows}` and switch
// renumberWithinGroup off (data is already overall-ordered by finishPosition
// from iRLM's combined scoring).
const combinedBranchOld = `rows={sortByOverall(allRows)}
            isMulticlass={isMulticlass}
            renumberWithinGroup`;
const combinedBranchNew = `rows={allRows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}`;

if (p.includes("rows={sortByOverall(allRows)}")) {
  p = p.replace(combinedBranchOld, combinedBranchNew);
  console.log("public round page: combined view reverted to plain finishPosition order.");
} else {
  console.log("public round page: combined view already uses plain order.");
}

fs.writeFileSync(PAGE, p);
PATCH_EOF

node scripts/patch-combined-import.mjs

echo ""
echo "=== Sanity check ==="
echo "irlm-import.ts uses eventResults[0]:"
grep -n 'combinedEventResult' src/lib/actions/irlm-import.ts | head -5
echo ""
echo "public round page combined branch:"
grep -n 'rows={allRows}\|rows={sortByOverall' \
  'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' | head -5

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "iRLM import: use COMBINED scoring (eventResults[0]); restore combined sort"
git push

echo ""
echo "Done. After Vercel redeploys, click 'Pull from iRLM' on the round to"
echo "re-import with overall positions. Combined view will then show 1..N."
