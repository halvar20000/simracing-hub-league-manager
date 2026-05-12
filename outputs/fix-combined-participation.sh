#!/usr/bin/env bash
# Fix: combinedPoints (per round) and combinedTotal (per season) both
# need to include participationPointsAwarded.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-combined-part.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// 1) Per-round combinedPoints: include rPart
s = s.replace(
  /combinedPoints:\s*rRaw\s*-\s*rPen,/g,
  "combinedPoints: rRaw + rPart - rPen,"
);

// 2) Update the doc comment so it reflects the new formula
s = s.replace(
  /combinedPoints:\s*number;\s*\/\/\s*=\s*rawPoints\s*-\s*penalty/g,
  "combinedPoints: number;     // = rawPoints + participation - penalty"
);

// 3) Per-season combinedTotal: same fix if it currently drops participation.
//    Possible existing forms: `combinedTotal: raw - penalty,`  or
//    `combinedTotal: rawPoints - penalty,`  or with whitespace/newlines.
//    We only act if participation isn't already in there.
const combinedTotalDropsPart = /combinedTotal:\s*([a-zA-Z]+)\s*-\s*penalty,/.test(
  s
);
if (combinedTotalDropsPart) {
  s = s.replace(
    /combinedTotal:\s*([a-zA-Z]+)\s*-\s*penalty,/,
    "combinedTotal: $1 + participation - penalty,"
  );
  console.log("Patched per-season combinedTotal to add participation.");
} else if (/combinedTotal:.*participation/.test(s)) {
  console.log("combinedTotal already includes participation — left alone.");
} else {
  console.log(
    "Could not match combinedTotal pattern; printing context for review:"
  );
  const idx = s.indexOf("combinedTotal");
  if (idx >= 0) console.log("  ", s.slice(idx, idx + 200));
}

if (s !== before) {
  fs.writeFileSync(FILE, s);
  console.log("Wrote fixes to " + FILE);
} else {
  console.log("No changes applied (already fixed?)");
}
EOF
node outputs-tmp/patch-combined-part.mjs
rm -rf outputs-tmp

echo ""
echo "Diff against HEAD (only standings.ts):"
git diff -- src/lib/standings.ts | head -40

echo ""
echo "=== Recomputing scoring on every round so cached round/season totals refresh ==="
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
    console.log(
      `Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Standings: combinedPoints + combinedTotal include participation points"
git push

echo ""
echo "Done. After Vercel redeploys, reload the GT4 TSS S3 standings page —"
echo "Matthias Beer's R1 Total should now show 35 (raw 30 + bonus 5)."
