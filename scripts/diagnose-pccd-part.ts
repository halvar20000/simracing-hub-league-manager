import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) { console.log("league not found"); return; }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
    include: { scoringSystem: true },
  });
  if (!season) { console.log("season not found"); return; }
  console.log(
    "Season:", season.name,
    "scoring=" + season.scoringSystem.name,
    "racesPerRound=" + season.scoringSystem.racesPerRound,
    "participationPts=" + season.scoringSystem.participationPoints,
    "participationMinPct=" + season.scoringSystem.participationMinDistancePct,
    "racePtsMinPct=" + season.scoringSystem.racePointsMinDistancePct
  );

  const rounds = await prisma.round.findMany({
    where: { seasonId: season.id, raceResults: { some: {} } },
    orderBy: { roundNumber: "asc" },
  });

  for (const r of rounds) {
    console.log(`\n=== R${r.roundNumber} ${r.name} ===`);
    const results = await prisma.raceResult.findMany({
      where: { roundId: r.id },
      include: {
        registration: { include: { user: true } },
      },
      orderBy: [
        { registration: { user: { lastName: "asc" } } },
        { raceNumber: "asc" },
      ],
    });

    // Group per driver
    const byReg = new Map<string, typeof results>();
    for (const rr of results) {
      const list = byReg.get(rr.registrationId) ?? [];
      list.push(rr);
      byReg.set(rr.registrationId, list);
    }

    for (const list of byReg.values()) {
      const sample = list[0];
      const driver =
        `${sample.registration.user.firstName} ${sample.registration.user.lastName}`;
      const partTotal = list.reduce(
        (s, x) => s + x.participationPointsAwarded,
        0
      );
      const racesInfo = list
        .sort((a, b) => a.raceNumber - b.raceNumber)
        .map(
          (x) =>
            `R${x.raceNumber}:${x.finishStatus}@${x.raceDistancePct}%`
        )
        .join("  ");
      const dsqAny = list.some((x) => x.finishStatus === "DSQ");
      const flag = partTotal === 0 ? "  ←ZERO" : "";
      console.log(
        `  ${driver.padEnd(30)} ${racesInfo.padEnd(40)} part=${partTotal}${
          dsqAny ? " (DSQ-forfeit)" : ""
        }${flag}`
      );
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
