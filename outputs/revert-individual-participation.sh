#!/usr/bin/env bash
# Revert: participation points should NOT count toward an individual driver's
# combinedPoints / combinedTotal. They only contribute to the Team score.
#
# Also dumps the computeTeamStandings function so we can verify that team
# totals do include participation. If they don't, that's a separate fix.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/lib/standings.ts'

mkdir -p outputs-tmp
cat > outputs-tmp/revert-combined-part.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");
const before = s;

// 1) Per-round combinedPoints: drop rPart back out
s = s.replace(
  /combinedPoints:\s*rRaw\s*\+\s*rPart\s*-\s*rPen,/g,
  "combinedPoints: rRaw - rPen,"
);

// 2) Comment in the RoundPoints interface
s = s.replace(
  /combinedPoints:\s*number;\s*\/\/\s*=\s*rawPoints\s*\+\s*participation\s*-\s*penalty/g,
  "combinedPoints: number;     // = rawPoints - penalty (driver champ — participation belongs to teams)"
);

// 3) Per-season combinedTotal: drop participation back out.
//    Match: combinedTotal: raw + participation - penalty,
s = s.replace(
  /combinedTotal:\s*raw\s*\+\s*participation\s*-\s*penalty,/,
  "combinedTotal: raw - penalty,"
);

if (s !== before) {
  fs.writeFileSync(FILE, s);
  console.log("Reverted combinedPoints + combinedTotal — participation no longer in driver totals.");
} else {
  console.log("Nothing to revert (already correct).");
}
EOF
node outputs-tmp/revert-combined-part.mjs
rm -rf outputs-tmp

echo ""
echo "=== Confirm new state of the relevant lines ==="
grep -n 'combinedPoints:\|combinedTotal:' "$PAGE"

echo ""
echo "=== Dump computeTeamStandings so we can see whether participation flows in ==="
LINE=$(grep -n 'export async function computeTeamStandings' "$PAGE" | head -1 | cut -d: -f1 || true)
if [ -n "${LINE:-}" ]; then
  END=$((LINE + 100))
  sed -n "${LINE},${END}p" "$PAGE"
fi

echo ""
echo "=== Recompute scoring on every round so individual totals refresh ==="
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
echo "=== Commit and push ==="
git add -A
git commit -m "Standings: drop participation from individual combinedPoints/combinedTotal (driver champ rules)"
git push

echo ""
echo "Done. After Vercel redeploys, Matthias Beer's R1 Total should be 30 again."
echo ""
echo "Then paste me the computeTeamStandings dump above so I can verify whether"
echo "team scoring currently includes participation, or whether that's a"
echo "separate fix."
