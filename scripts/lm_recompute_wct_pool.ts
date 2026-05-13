/**
 * Recompute the auto-forgiveness pool for the current GT3 WCT season.
 * Pure: just calls recomputePenaltyPoolForSeason — useful after changing the
 * engine logic to refresh autoForgivenPoints across all drivers.
 */
import { prisma } from "@/lib/prisma";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-gt3-wct" },
    select: { id: true },
  });
  if (!league) throw new Error("League cas-gt3-wct not found");

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, year: true },
  });
  if (!season) throw new Error("No season found");

  console.log(`Recomputing penalty pool for ${season.name} ${season.year}…`);
  const r = await recomputePenaltyPoolForSeason(season.id);
  console.log(JSON.stringify(r, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
