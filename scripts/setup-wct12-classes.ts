import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";

const SEASON_ID = process.env.SEASON_ID!;

// iRacing ID -> "PRO" | "AM" mapping from the WCT12 registration sheet
// (Anmeldung WCT Season 12). 45 drivers.
const ROSTER: Array<{ iracingId: string; cls: "PRO" | "AM" }> = [
  { iracingId: "384541",  cls: "AM"  },
  { iracingId: "388458",  cls: "PRO" },
  { iracingId: "731013",  cls: "PRO" },
  { iracingId: "1057110", cls: "AM"  },
  { iracingId: "479423",  cls: "PRO" },
  { iracingId: "956612",  cls: "AM"  },
  { iracingId: "1231097", cls: "AM"  },
  { iracingId: "158597",  cls: "AM"  },
  { iracingId: "1140676", cls: "AM"  },
  { iracingId: "646405",  cls: "AM"  },
  { iracingId: "812582",  cls: "PRO" },
  { iracingId: "891101",  cls: "PRO" },
  { iracingId: "770518",  cls: "AM"  },
  { iracingId: "974264",  cls: "PRO" },
  { iracingId: "844831",  cls: "PRO" },
  { iracingId: "1118486", cls: "AM"  },
  { iracingId: "841362",  cls: "AM"  },
  { iracingId: "1021560", cls: "AM"  },
  { iracingId: "574387",  cls: "PRO" },
  { iracingId: "439230",  cls: "AM"  },
  { iracingId: "227997",  cls: "PRO" },
  { iracingId: "1135701", cls: "AM"  },
  { iracingId: "1124831", cls: "PRO" },
  { iracingId: "894097",  cls: "AM"  },
  { iracingId: "1189750", cls: "AM"  },
  { iracingId: "1180816", cls: "PRO" },
  { iracingId: "1200858", cls: "PRO" },
  { iracingId: "616923",  cls: "AM"  },
  { iracingId: "645893",  cls: "AM"  },
  { iracingId: "841198",  cls: "AM"  },
  { iracingId: "861718",  cls: "PRO" },
  { iracingId: "634477",  cls: "AM"  },
  { iracingId: "698837",  cls: "AM"  },
  { iracingId: "407036",  cls: "PRO" },
  { iracingId: "912856",  cls: "AM"  },
  { iracingId: "1057822", cls: "AM"  },
  { iracingId: "1158328", cls: "PRO" },
  { iracingId: "633394",  cls: "PRO" },
  { iracingId: "1218224", cls: "PRO" },
  { iracingId: "1174590", cls: "AM"  },
  { iracingId: "1051932", cls: "PRO" },
  { iracingId: "1378586", cls: "AM"  },
  { iracingId: "1030766", cls: "AM"  },
  { iracingId: "1107733", cls: "PRO" },
  { iracingId: "544198",  cls: "PRO" },
];

async function main() {
  // 1. Make sure the season is multiclass
  const season = await prisma.season.findUnique({
    where: { id: SEASON_ID },
    select: { id: true, name: true, isMulticlass: true },
  });
  if (!season) throw new Error("Season not found");
  if (!season.isMulticlass) {
    await prisma.season.update({
      where: { id: SEASON_ID },
      data: { isMulticlass: true },
    });
    console.log("Marked season as multiclass.");
  } else {
    console.log("Season already multiclass.");
  }

  // 2. Upsert PRO + AM CarClass rows
  // We rely on shortCode being unique within a season; if your schema has
  // a different unique key, we fall back to find-then-create.
  async function upsertClass(name: string, shortCode: string, displayOrder: number) {
    const existing = await prisma.carClass.findFirst({
      where: { seasonId: SEASON_ID, shortCode },
    });
    if (existing) {
      const upd = await prisma.carClass.update({
        where: { id: existing.id },
        data: { name, displayOrder },
      });
      return upd;
    }
    return prisma.carClass.create({
      data: { seasonId: SEASON_ID, name, shortCode, displayOrder },
    });
  }
  const pro = await upsertClass("Pro", "PRO", 1);
  const am = await upsertClass("Am", "AM", 2);
  console.log("CarClasses ready:", { pro: pro.id, am: am.id });

  // 3. For each driver in the roster, find their Registration by user iRacing ID and update carClassId
  let updated = 0;
  let notFound = 0;
  for (const r of ROSTER) {
    const reg = await prisma.registration.findFirst({
      where: {
        seasonId: SEASON_ID,
        user: { iracingMemberId: r.iracingId },
      },
      include: { user: true },
    });
    if (!reg) {
      console.log(`  no Registration for iRacingId=${r.iracingId} (${r.cls}) — skipped`);
      notFound++;
      continue;
    }
    const targetClassId = r.cls === "PRO" ? pro.id : am.id;
    if (reg.carClassId === targetClassId) continue; // already correct
    await prisma.registration.update({
      where: { id: reg.id },
      data: { carClassId: targetClassId },
    });
    updated++;
  }
  console.log(`Registrations: ${updated} updated, ${notFound} not found in DB.`);

  // 4. Recompute scoring on every round of this season that already has results
  const rounds = await prisma.round.findMany({
    where: { seasonId: SEASON_ID, raceResults: { some: {} } },
    select: { id: true, roundNumber: true },
    orderBy: { roundNumber: "asc" },
  });
  for (const rd of rounds) {
    await recomputeRoundScoring(prisma, rd.id);
    console.log(`Recomputed scoring for round ${rd.roundNumber}`);
  }

  // 5. Final state
  const counts = await prisma.registration.groupBy({
    by: ["carClassId"],
    where: { seasonId: SEASON_ID, status: "APPROVED" },
    _count: { _all: true },
  });
  console.log("Approved registrations per carClassId:", counts);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
