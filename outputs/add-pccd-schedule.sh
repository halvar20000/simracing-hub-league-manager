#!/usr/bin/env bash
# Add the PCCD Season 5 schedule image to the most recent CAS PCCD season.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# 1. Copy file to public/schedules
mkdir -p public/schedules
cp "schedules/CAS_Porsche_Cup_Season5_Poster.png" \
   "public/schedules/cas-pccd-season-5.png"
echo ">>> Image copied."

# 2. Set scheduleImageUrl on the most recent CAS PCCD season
mkdir -p scripts
cat > scripts/set-pccd-schedule.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-pccd" },
  });
  if (!league) {
    console.error("League cas-pccd not found");
    process.exit(1);
  }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season found in CAS PCCD — create one first");
    process.exit(1);
  }
  await prisma.season.update({
    where: { id: season.id },
    data: { scheduleImageUrl: "/schedules/cas-pccd-season-5.png" },
  });
  console.log(`Schedule image set on ${season.name} ${season.year}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF
npx tsx scripts/set-pccd-schedule.ts

echo ""
echo "Done. Visit the CAS PCCD season page to see the schedule."
