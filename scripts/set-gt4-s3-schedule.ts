import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-tss-gt4" } });
  if (!league) throw new Error("cas-tss-gt4 league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, name: "3rd Season", year: 2026 },
  });
  if (!season) throw new Error("GT4 TSS 3rd Season not found");
  console.log("Updating season:", season.id, season.name);
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/GT4_TSS_Schedule-Season-3.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
