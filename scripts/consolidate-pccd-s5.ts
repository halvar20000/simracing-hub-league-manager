import { prisma } from "@/lib/prisma";

const SEASON_ID = "cmoefqawn0001l104qb7429mq"; // 5th season

// Pairs: keep the first race of each, drop the second.
// (oldRoundNumber, newRoundNumber, name, track, trackConfig)
type Plan = { oldNum: number; newNum: number; name: string; track: string; trackConfig: string | null };
const SURVIVORS: Plan[] = [
  { oldNum: 1,  newNum: 1, name: "Jerez",          track: "Jerez",                   trackConfig: null },
  { oldNum: 3,  newNum: 2, name: "Nürburgring",    track: "Nürburgring",             trackConfig: "GP" },
  { oldNum: 5,  newNum: 3, name: "Oran Park",      track: "Oran Park",               trackConfig: null },
  { oldNum: 7,  newNum: 4, name: "Oschersleben",   track: "Oschersleben",            trackConfig: null },
  { oldNum: 9,  newNum: 5, name: "Donington Park", track: "Donington Park",          trackConfig: null },
  { oldNum: 11, newNum: 6, name: "Zolder",         track: "Zolder",                  trackConfig: "GP" },
  { oldNum: 13, newNum: 7, name: "Algarve",        track: "Algarve (Portimao)",      trackConfig: null },
  { oldNum: 15, newNum: 8, name: "Hungaroring",    track: "Hungaroring",             trackConfig: null },
];
const TO_DELETE = [2, 4, 6, 8, 10, 12, 14, 16];

async function main() {
  const season = await prisma.season.findUnique({
    where: { id: SEASON_ID },
    include: { _count: { select: { rounds: true } } },
  });
  if (!season) throw new Error("Season not found");
  console.log("Season:", season.name, "rounds before =", season._count.rounds);

  // Safety: refuse if any of the rounds we're about to touch have raceResults.
  const conflicts = await prisma.round.findMany({
    where: {
      seasonId: SEASON_ID,
      raceResults: { some: {} },
    },
    select: { roundNumber: true, name: true, _count: { select: { raceResults: true } } },
  });
  if (conflicts.length > 0) {
    console.error("Refusing — these rounds already have race results:");
    for (const c of conflicts) console.error(" ", c);
    process.exit(1);
  }

  // 1. Delete the even-numbered rounds (no race results, safe).
  const del = await prisma.round.deleteMany({
    where: { seasonId: SEASON_ID, roundNumber: { in: TO_DELETE } },
  });
  console.log("Deleted", del.count, "rounds:", TO_DELETE.join(", "));

  // 2. Renumber + rename the survivors. Apply in ascending order of newNum
  //    since the slots above are now free (the evens were deleted) and
  //    each survivor moves into a slot that's lower than its current one.
  for (const p of SURVIVORS) {
    if (p.oldNum === p.newNum) {
      // Just update fields on the round that already has the right number.
      await prisma.round.update({
        where: { seasonId_roundNumber: { seasonId: SEASON_ID, roundNumber: p.oldNum } },
        data: {
          name: p.name,
          track: p.track,
          trackConfig: p.trackConfig,
          raceLengthMinutes: 50,
        },
      });
      console.log(`R${p.oldNum} updated in place (name='${p.name}').`);
      continue;
    }
    // Move to a temporary number first to avoid the unique([seasonId, roundNumber])
    // constraint colliding with later survivors that haven't been moved yet.
    const tmpNum = 1000 + p.oldNum;
    await prisma.round.update({
      where: { seasonId_roundNumber: { seasonId: SEASON_ID, roundNumber: p.oldNum } },
      data: { roundNumber: tmpNum },
    });
    await prisma.round.update({
      where: { seasonId_roundNumber: { seasonId: SEASON_ID, roundNumber: tmpNum } },
      data: {
        roundNumber: p.newNum,
        name: p.name,
        track: p.track,
        trackConfig: p.trackConfig,
        raceLengthMinutes: 50,
      },
    });
    console.log(`R${p.oldNum} -> R${p.newNum} (name='${p.name}').`);
  }

  // Confirmation
  const after = await prisma.round.findMany({
    where: { seasonId: SEASON_ID },
    orderBy: { roundNumber: "asc" },
    select: { roundNumber: true, name: true, track: true, trackConfig: true, startsAt: true, raceLengthMinutes: true },
  });
  console.log("\nFinal rounds (should be 8):");
  for (const r of after) {
    console.log(
      `  R${r.roundNumber} ${r.startsAt.toISOString().slice(0, 10)} ` +
      `name='${r.name}' track='${r.track}'${r.trackConfig ? ` (${r.trackConfig})` : ""} ` +
      `length=${r.raceLengthMinutes}min`
    );
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
