import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) { console.log("league not found"); return; }

  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id },
    include: { _count: { select: { rounds: true, registrations: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("All PCCD seasons:");
  for (const s of seasons) {
    console.log(`  ${s.id}  '${s.name}' (year ${s.year})  rounds=${s._count.rounds} regs=${s._count.registrations}`);
  }

  // Heuristic: pick the season with 16 rounds
  const s5 = seasons.find((s) => s._count.rounds === 16) ?? seasons.find((s) => s.name.toLowerCase().includes("5"));
  if (!s5) {
    console.log("\nNo 5th-season candidate found.");
    return;
  }
  console.log(`\n=== Inspecting '${s5.name}' (${s5.id}) ===`);

  const rounds = await prisma.round.findMany({
    where: { seasonId: s5.id },
    orderBy: [{ roundNumber: "asc" }],
    include: { _count: { select: { raceResults: true } } },
  });
  for (const r of rounds) {
    console.log(
      `  R${String(r.roundNumber).padStart(2)} ` +
      `${r.startsAt.toISOString().slice(0, 10)}  ` +
      `name='${r.name}' track='${r.track}'${r.trackConfig ? ` (${r.trackConfig})` : ""}` +
      `  irlmEventId=${r.irlmEventId ?? "null"}  raceResults=${r._count.raceResults}` +
      `  raceLengthMinutes=${r.raceLengthMinutes ?? "null"}` +
      `  status=${r.status}`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
