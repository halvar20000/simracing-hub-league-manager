#!/usr/bin/env bash
# Fix the double-1 / double-2 issue in the Combined view by sorting by
# (lapsCompleted desc, bestLapTimeMs asc) and renumbering positions 1..N.
# Pro / Am / Team views are untouched — they already render correctly.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

mkdir -p scripts
cat > scripts/patch-combined-rank.mjs <<'PATCH_EOF'
import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Add a sortByOverall helper just under sortByFinish.
const helperAnchor =
`function sortByFinish<R extends { finishStatus: string; finishPosition: number }>(
  rows: R[]
): R[] {
  return [...rows].sort((a, b) => {
    if (a.finishStatus !== b.finishStatus) {
      if (a.finishStatus === "CLASSIFIED") return -1;
      if (b.finishStatus === "CLASSIFIED") return 1;
    }
    return a.finishPosition - b.finishPosition;
  });
}`;
const helperAddition =
`function sortByFinish<R extends { finishStatus: string; finishPosition: number }>(
  rows: R[]
): R[] {
  return [...rows].sort((a, b) => {
    if (a.finishStatus !== b.finishStatus) {
      if (a.finishStatus === "CLASSIFIED") return -1;
      if (b.finishStatus === "CLASSIFIED") return 1;
    }
    return a.finishPosition - b.finishPosition;
  });
}

function sortByOverall<
  R extends {
    finishStatus: string;
    lapsCompleted: number;
    bestLapTimeMs: number | null;
  }
>(rows: R[]): R[] {
  return [...rows].sort((a, b) => {
    // Classified first
    if (a.finishStatus !== b.finishStatus) {
      if (a.finishStatus === "CLASSIFIED") return -1;
      if (b.finishStatus === "CLASSIFIED") return 1;
    }
    // More laps wins
    if (a.lapsCompleted !== b.lapsCompleted) {
      return b.lapsCompleted - a.lapsCompleted;
    }
    // Faster best lap wins (null treated as +Infinity)
    const al = a.bestLapTimeMs ?? Number.POSITIVE_INFINITY;
    const bl = b.bestLapTimeMs ?? Number.POSITIVE_INFINITY;
    return al - bl;
  });
}`;

if (s.includes("function sortByOverall<")) {
  console.log("sortByOverall helper already present.");
} else {
  if (!s.includes(helperAnchor)) {
    console.error("Could not find sortByFinish anchor.");
    process.exit(1);
  }
  s = s.replace(helperAnchor, helperAddition);
  console.log("Added sortByOverall helper.");
}

// 2) Sort allRows for the combined view and renumber.
//    Replace the combined branch that currently passes `rows={allRows}` and
//    `renumberWithinGroup={false}` with a sorted, renumbered version.
const oldBranch =
`        ) : (
          <ResultsTable
            rows={allRows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            winnerTotalTimeMs={combinedWinner?.totalTimeMs ?? null}
          />
        )}`;
const newBranch =
`        ) : (
          <ResultsTable
            rows={sortByOverall(allRows)}
            isMulticlass={isMulticlass}
            renumberWithinGroup
          />
        )}`;
if (s.includes("rows={sortByOverall(allRows)}")) {
  console.log("Combined branch already uses sortByOverall.");
} else {
  if (!s.includes(oldBranch)) {
    console.error("Could not find combined branch anchor.");
    process.exit(1);
  }
  s = s.replace(oldBranch, newBranch);
  console.log("Combined branch now sorts by (laps desc, bestLap asc) and renumbers.");
}

// 3) combinedWinner is no longer used. Remove its declaration to avoid an
//    'unused variable' lint failure on Vercel.
s = s.replace(
  /\s*\/\/ Combined-view winner for gap calc\n  const combinedWinner = allRows\.find\(\n\s+\(r\) => r\.finishStatus === "CLASSIFIED" && r\.finishPosition === 1\n\s+\);\n/,
  "\n"
);

fs.writeFileSync(PAGE, s);
console.log("Patch complete.");
PATCH_EOF

node scripts/patch-combined-rank.mjs

echo ""
echo "Sanity check:"
grep -n 'sortByOverall\|combinedWinner' "$PAGE" | head -10

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Combined round view: rank by (laps desc, bestLap asc), eliminate duplicate positions"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
