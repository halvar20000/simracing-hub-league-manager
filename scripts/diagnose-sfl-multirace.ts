import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-sfl-cup" } });
  if (!league) { console.log("league not found"); return; }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
    include: {
      scoringSystem: { select: { name: true, racesPerRound: true } },
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });
  if (!season) { console.log("season not found"); return; }

  console.log("Season:", season.name, "scoring=" + season.scoringSystem.name, "racesPerRound=" + season.scoringSystem.racesPerRound);

  for (const r of season.rounds) {
    const counts = await prisma.raceResult.groupBy({
      by: ["raceNumber"],
      where: { roundId: r.id },
      _count: { _all: true },
    });
    const total = counts.reduce((s, c) => s + c._count._all, 0);
    const summary = counts
      .sort((a, b) => a.raceNumber - b.raceNumber)
      .map((c) => `R${c.raceNumber}=${c._count._all}`)
      .join(", ");
    console.log(
      `R${r.roundNumber} ${r.name}: total=${total}` +
      (summary ? `  (${summary})` : "")
    );
  }

  console.log("");
  console.log("Latest CsvImport rows for SFL S7 (chronological, last 10):");
  const imports = await prisma.csvImport.findMany({
    where: { round: { seasonId: season.id } },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      createdAt: true,
      originalFilename: true,
      rowsImported: true,
      rowsSkipped: true,
      round: { select: { roundNumber: true } },
    },
  });
  for (const i of imports) {
    console.log(
      `  R${i.round.roundNumber} ${i.createdAt.toISOString()} ${i.originalFilename} imported=${i.rowsImported} skipped=${i.rowsSkipped}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
