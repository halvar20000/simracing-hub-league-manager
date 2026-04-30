import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) throw new Error("cas-gt3-wct league not found");
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) throw new Error("WCT 2026 season not found");
  console.log("Updating season:", season.id, season.name);
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/cas-gt3-wct-season-12.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
