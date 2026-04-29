import { prisma } from "@/lib/prisma";

async function main() {
  // Find every PCCD season — show context.
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
  console.log("All PCCD seasons:");
  for (const s of seasons) {
    console.log(
      `  ${s.id}  ${s.name} (year ${s.year})  rounds=${s._count.rounds} regs=${s._count.registrations}` +
        ` racesPerRound=${s.scoringSystem.racesPerRound}`
    );
  }

  // Pick the one named "Season 04" — that's the new one we just created.
  const target = seasons.find((s) => s.name === "Season 04");
  if (!target) {
    console.log("\nNo 'Season 04' found.");
    return;
  }
  console.log("\n=== Diagnosing", target.name, "(", target.id, ") ===");

  const rounds = await prisma.round.findMany({
    where: { seasonId: target.id, raceResults: { some: {} } },
    orderBy: { roundNumber: "asc" },
  });
  if (rounds.length === 0) {
    console.log(
      "No rounds with race results yet — have you clicked Pull from iRLM on any round?"
    );
    return;
  }

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
