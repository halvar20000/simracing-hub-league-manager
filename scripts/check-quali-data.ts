import { prisma } from "@/lib/prisma";

const ROUND_ID = process.env.ROUND_ID!;

async function main() {
  const rows = await prisma.raceResult.findMany({
    where: { roundId: ROUND_ID },
    orderBy: { finishPosition: "asc" },
    take: 10,
    select: {
      finishPosition: true,
      startPosition: true,
      qualifyingTimeMs: true,
      bestLapTimeMs: true,
      registration: { select: { user: { select: { iracingMemberId: true } } } },
    },
  });
  console.log("Top 10 rows of round:", ROUND_ID);
  for (const r of rows) {
    console.log(
      "  Pos",
      String(r.finishPosition).padStart(2, " "),
      "| Grid",
      r.startPosition ?? "-",
      "| Quali ms",
      r.qualifyingTimeMs ?? "-",
      "| Best ms",
      r.bestLapTimeMs ?? "-",
      "| custId",
      r.registration?.user?.iracingMemberId ?? "?"
    );
  }
}
main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
