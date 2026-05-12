#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/check-brendel.ts <<'EOF'
import { prisma } from "@/lib/prisma";

async function main() {
  const user = await prisma.user.findFirst({
    where: { lastName: "Brendel", firstName: { startsWith: "Kai" } },
  });
  if (!user) { console.log("Kai Brendel not found"); return; }
  console.log("User:", user.id, user.firstName, user.lastName, "iRacingId=" + user.iracingMemberId);

  const regs = await prisma.registration.findMany({
    where: { userId: user.id },
    include: {
      season: { include: { league: true, scoringSystem: true } },
      raceResults: {
        include: { round: { select: { roundNumber: true, name: true } } },
        orderBy: [
          { round: { roundNumber: "asc" } },
          { raceNumber: "asc" },
        ],
      },
      penalties: true,
    },
  });

  for (const reg of regs) {
    console.log("");
    console.log(
      "Registration in",
      reg.season.league.slug,
      reg.season.name,
      "id=" + reg.id,
      "status=" + reg.status,
      "excludedAt=" + (reg.excludedAt ?? "null")
    );
    let raw = 0, part = 0, pen = 0, corr = 0;
    for (const r of reg.raceResults) {
      console.log(
        `  R${r.round.roundNumber} ${r.round.name} race=${r.raceNumber}` +
          ` pos=${r.finishPosition} status=${r.finishStatus}` +
          ` distance=${r.raceDistancePct}%` +
          ` raw=${r.rawPointsAwarded} part=${r.participationPointsAwarded}` +
          ` pen=${r.manualPenaltyPoints} corr=${r.correctionPoints}`
      );
      raw += r.rawPointsAwarded;
      part += r.participationPointsAwarded;
      pen += r.manualPenaltyPoints;
      corr += r.correctionPoints;
    }
    console.log(
      `  totals: raw=${raw} part=${part} pen=${pen} correction=${corr}` +
        ` -> combined = ${raw + part - pen + corr}`
    );
    if (reg.penalties.length > 0) {
      console.log("  Season-level penalties:");
      for (const p of reg.penalties) {
        console.log(`    ${p.type ?? "?"}: pointsValue=${p.pointsValue}`);
      }
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
npx tsx scripts/check-brendel.ts
