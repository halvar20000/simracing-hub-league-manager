#!/usr/bin/env bash
# PCCD: copy R1 points table -> R2 (same distribution for both races) and
# recompute every round so totals update.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/fix-pccd-r2.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";

async function main() {
  const ss = await prisma.scoringSystem.findUnique({ where: { name: "CAS PCCD" } });
  if (!ss) throw new Error("CAS PCCD not found");
  const r1 = ss.pointsTable;
  console.log("Current R1 points (will be copied to R2):");
  console.log(" ", r1);
  await prisma.scoringSystem.update({
    where: { id: ss.id },
    data: { pointsTableRace2: r1 },
  });
  console.log("Updated CAS PCCD: pointsTableRace2 now equals pointsTable.");

  // Recompute scoring for every PCCD round with results
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: ss.id },
    select: { id: true, name: true },
  });
  for (const s of seasons) {
    const rounds = await prisma.round.findMany({
      where: { seasonId: s.id, raceResults: { some: {} } },
      select: { id: true, roundNumber: true },
      orderBy: { roundNumber: "asc" },
    });
    for (const r of rounds) {
      await recomputeRoundScoring(prisma, r.id);
      console.log(`Recomputed ${s.name} R${r.roundNumber}`);
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/fix-pccd-r2.ts

echo ""
echo "Done. Reload the PCCD standings — Foth's R1 (Watkins Glen) round total should be 76."
echo "If PCCD's actual R2 distribution is DIFFERENT from R1, edit it at"
echo "  /admin/scoring-systems/<id>/edit  (and save will recompute everything)."
