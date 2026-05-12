#!/usr/bin/env bash
# Step 1: re-apply participation -> individual totals (combinedPoints +
#          combinedTotal). My revert was wrong.
# Step 2: dump the drop-worst-N logic so I can see where the penalty for a
#          dropped round still leaks into the season total.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/lib/standings.ts'

mkdir -p outputs-tmp
cat > outputs-tmp/refix-combined.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// Re-add rPart to combinedPoints
s = s.replace(
  /combinedPoints:\s*rRaw\s*-\s*rPen,/g,
  "combinedPoints: rRaw + rPart - rPen,"
);

// Update doc comment
s = s.replace(
  /combinedPoints:\s*number;\s*\/\/[^\n]*driver champ[^\n]*\n/g,
  "combinedPoints: number;     // = rawPoints + participation - penalty\n"
);
// Also handle the simpler "= rawPoints - penalty" if that's what's there
s = s.replace(
  /combinedPoints:\s*number;\s*\/\/\s*=\s*rawPoints\s*-\s*penalty/g,
  "combinedPoints: number;     // = rawPoints + participation - penalty"
);

// Re-add participation to combinedTotal
s = s.replace(
  /combinedTotal:\s*raw\s*-\s*penalty,/,
  "combinedTotal: raw + participation - penalty,"
);

if (s !== before) {
  fs.writeFileSync(FILE, s);
  console.log("Re-applied participation to combinedPoints + combinedTotal.");
} else {
  console.log("Nothing to change (already correct).");
}
EOF
node outputs-tmp/refix-combined.mjs
rm -rf outputs-tmp

echo ""
echo "=== Confirm current state ==="
grep -n 'combinedPoints:\|combinedTotal:\|classPoints:\|classTotal:' "$PAGE" | head -20

echo ""
echo "=== Dump the drop-worst-N logic so we can find the penalty leak ==="
echo ""
echo "--- Lines mentioning drop / worst / sort / slice (likely contain the drop logic) ---"
grep -n 'drop\|Drop\|worst\|Worst\|dropWorstN\|sort\|slice' "$PAGE" | head -30

echo ""
echo "--- Show 60 lines around 'dropWorstN' if present ---"
LINE=$(grep -n 'dropWorstN\|dropWorst' "$PAGE" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  START=$((LINE > 30 ? LINE - 30 : 1))
  END=$((LINE + 60))
  echo "(lines $START-$END)"
  sed -n "${START},${END}p" "$PAGE"
else
  echo "(no dropWorstN reference found — drop logic might be named differently)"
fi

echo ""
echo "--- Also dump lines 100-200 (likely contain the per-driver result aggregation) ---"
sed -n '100,200p' "$PAGE"

echo ""
echo "=== Recompute scoring (so the participation re-fix takes effect) ==="
mkdir -p scripts
cat > scripts/recompute-all-rounds.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";
async function main() {
  const rounds = await prisma.round.findMany({
    where: { raceResults: { some: {} } },
    select: { id: true, roundNumber: true, season: { select: { name: true, league: { select: { slug: true } } } } },
    orderBy: [{ season: { league: { slug: "asc" } } }, { season: { name: "asc" } }, { roundNumber: "asc" }],
  });
  for (const r of rounds) {
    await recomputeRoundScoring(prisma, r.id);
    console.log(`Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push the participation re-fix ==="
git add -A
git commit -m "Standings: re-add participation to individual combinedPoints/combinedTotal"
git push

echo ""
echo "Done with step 1. After Vercel redeploys, Matthias Beer's R1 Total"
echo "should be 35 again."
echo ""
echo "Now PASTE the dump output above (the drop logic + the lines 100-200"
echo "aggregation) so I can find the penalty leak and ship step 2."
