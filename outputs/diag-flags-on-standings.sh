#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== A. Standings page imports + CountryFlag refs ==="
grep -n 'CountryFlag\|IRatingChip\|driverFirstName\|countryCode' \
  'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' | head -20

echo ""
echo "=== B. standings.ts: DriverStanding interface + ctor refs ==="
grep -n 'countryCode\|driverFirstName\|driverLastName' src/lib/standings.ts | head -20

echo ""
echo "=== C. Sample DriverStanding output for one season (Thomas Herbrig should have DE) ==="
mkdir -p scripts
cat > scripts/diag-stand.ts <<'EOF'
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
EOF
npx tsx scripts/diag-stand.ts
