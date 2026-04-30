import { prisma } from "@/lib/prisma";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-pccd" } });
  if (!league) throw new Error("cas-pccd league not found");
  // Find the season whose name contains "4th" (case-insensitive)
  const seasons = await prisma.season.findMany({
    where: { leagueId: league.id, year: 2026 },
  });
  const target =
    seasons.find((s) => /\b4th\b/i.test(s.name)) ??
    seasons.find((s) => s.name.includes("04"));
  if (!target) {
    console.error("No 4th-season match. Existing PCCD 2026 seasons:");
    for (const s of seasons) console.error(" ", s.id, s.name);
    process.exit(1);
  }
  console.log("Updating season:", target.id, target.name);
  await prisma.season.update({
    where: { id: target.id },
    data: { scheduleImageUrl: "/schedules/CAS-PCup-Season-4.png" },
  });
  console.log("Done. scheduleImageUrl set.");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
