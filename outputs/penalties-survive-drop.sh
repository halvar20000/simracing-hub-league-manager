#!/usr/bin/env bash
# Penalties always count — even when their round is dropped.
#  - standings.ts: stop subtracting penalty for dropped rounds
#  - standings page: keep strikethrough on Total/R/B for dropped rounds,
#                    remove it from the P cell
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) standings.ts: remove "penalty -= rp.penaltyPoints" from drop block
# ---------------------------------------------------------------
cat > outputs-tmp/patch-keep-penalty.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

const before =
  "          if (droppedIds.has(rp.roundId)) {\n" +
  "            rp.dropped = true;\n" +
  "            raw -= rp.rawPoints;\n" +
  "            classRaw -= rp.classRawPoints;\n" +
  "            participation -= rp.participationPoints;\n" +
  "            penalty -= rp.penaltyPoints;\n" +
  "          }";
const after =
  "          if (droppedIds.has(rp.roundId)) {\n" +
  "            rp.dropped = true;\n" +
  "            raw -= rp.rawPoints;\n" +
  "            classRaw -= rp.classRawPoints;\n" +
  "            participation -= rp.participationPoints;\n" +
  "            // penalty stays — penalties always count, even when the round is dropped\n" +
  "          }";

if (s.includes("penalty stays — penalties always count")) {
  console.log("standings.ts: already keeping penalty.");
} else if (!s.includes(before)) {
  console.error("Could not find drop block to patch.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings.ts: penalty no longer subtracted on drop.");
}
EOF
node outputs-tmp/patch-keep-penalty.mjs

# ---------------------------------------------------------------
# 2) standings page: revert strikethrough on the P (red-400) cell
# ---------------------------------------------------------------
cat > outputs-tmp/patch-p-cell.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Revert ONLY the P cell (red-400 text) — Total/R/B cells keep their strikethrough.
const before =
  '<td className={`px-1.5 py-1.5 text-right tabular-nums text-red-400${rp.dropped ? " line-through opacity-60" : ""}`}>';
const after =
  '<td className="px-1.5 py-1.5 text-right tabular-nums text-red-400">';

if (!s.includes(before)) {
  if (s.includes(after)) {
    console.log("standings page: P cell already plain.");
  } else {
    console.error("Could not find P cell anchor.");
    process.exit(1);
  }
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings page: P cell strikethrough removed.");
}
EOF
node outputs-tmp/patch-p-cell.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 3) Recompute scoring on every round so totals refresh
# ---------------------------------------------------------------
echo ""
echo "=== Recompute all rounds ==="
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
git commit -m "Drop weeks: penalties always count, even when round is dropped"
git push

echo ""
echo "Done. After Vercel:"
echo "  - In dropped rounds, R / B / Total cells stay strikethrough."
echo "  - P (penalty) cell no longer has strikethrough — penalties still subtract from season total."
