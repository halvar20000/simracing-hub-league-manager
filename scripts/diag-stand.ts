import { prisma } from "@/lib/prisma";
import { computeDriverStandings } from "@/lib/standings";

async function main() {
  const league = await prisma.league.findUnique({ where: { slug: "cas-gt3-wct" } });
  if (!league) { console.log("league not found"); return; }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id, year: 2026 },
  });
  if (!season) { console.log("season not found"); return; }
  console.log("Season:", season.name, season.id);
  const standings = await computeDriverStandings(prisma, season.id);
  console.log("Standings count:", standings.length);
  console.log("Top 3:");
  for (const s of standings.slice(0, 3)) {
    console.log("  ", {
      name: `${s.driverFirstName} ${s.driverLastName}`,
      countryCode: s.countryCode,
      total: s.combinedTotal,
    });
  }
  // Look up a driver we know has countryCode
  const t = standings.find(
    (s) => s.driverLastName === "Herbrig" || s.driverLastName === "Zocher"
  );
  if (t) {
    console.log("\nLooked-up sample:", {
      name: `${t.driverFirstName} ${t.driverLastName}`,
      countryCode: t.countryCode,
    });
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
