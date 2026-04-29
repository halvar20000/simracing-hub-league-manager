import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) { console.log("league not found"); return; }

  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id },
    include: {
      scoringSystem: true,
      _count: { select: { rounds: true, registrations: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Annotate with results-count
  console.log("All PCCD seasons:");
  let active: typeof seasons[number] | null = null;
  let activeCount = -1;
  for (const s of seasons) {
    const resCount = await prisma.raceResult.count({
      where: { round: { seasonId: s.id } },
    });
    console.log(
      `  ${s.id}  '${s.name}' (year ${s.year})` +
      `  rounds=${s._count.rounds} regs=${s._count.registrations}` +
      `  raceResults=${resCount}` +
      `  racesPerRound=${s.scoringSystem.racesPerRound}`
    );
    if (resCount > activeCount) {
      active = s;
      activeCount = resCount;
    }
  }
  if (!active || activeCount <= 0) {
    console.log("\nNo PCCD season has race results yet.");
    return;
  }
  console.log("\n=== Diagnosing season with most results:", active.name, "(", active.id, ") ===");

  const rounds = await prisma.round.findMany({
    where: { seasonId: active.id, raceResults: { some: {} } },
    orderBy: { roundNumber: "asc" },
  });

  for (const r of rounds) {
    console.log(`\n--- R${r.roundNumber} ${r.name} ---`);
    const results = await prisma.raceResult.findMany({
      where: { roundId: r.id },
      include: { registration: { include: { user: true } } },
      orderBy: [
        { registration: { user: { lastName: "asc" } } },
        { raceNumber: "asc" },
      ],
    });

    const byReg = new Map<string, typeof results>();
    for (const rr of results) {
      const list = byReg.get(rr.registrationId) ?? [];
      list.push(rr);
      byReg.set(rr.registrationId, list);
    }

    for (const list of byReg.values()) {
      const sample = list[0];
      const driver = `${sample.registration.user.firstName} ${sample.registration.user.lastName}`;
      const partTotal = list.reduce((s, x) => s + x.participationPointsAwarded, 0);
      const racesInfo = list
        .sort((a, b) => a.raceNumber - b.raceNumber)
        .map((x) => `R${x.raceNumber}:${x.finishStatus}@${x.raceDistancePct}%`)
        .join("  ");
      const dsqAny = list.some((x) => x.finishStatus === "DSQ");
      const flag = partTotal === 0 ? "  ←ZERO" : "";
      console.log(
        `  ${driver.padEnd(30)} ${racesInfo.padEnd(40)} part=${partTotal}${dsqAny ? " (DSQ-forfeit)" : ""}${flag}`
      );
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
