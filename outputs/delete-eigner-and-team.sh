#!/usr/bin/env bash
# Remove Florian Eigner (iRacing 544198) and the Team Phase 2 from the
# CAS GT3 WCT season. Deletes his registration (cascades any race results)
# and the team. Keeps the User account in case he registers later.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts

cat > scripts/delete-eigner-and-team.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const league = await prisma.league.findUnique({
    where: { slug: "cas-gt3-wct" },
  });
  if (!league) {
    console.error("League cas-gt3-wct not found");
    process.exit(1);
  }

  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error("No season in cas-gt3-wct");
    process.exit(1);
  }

  const eigner = await prisma.user.findUnique({
    where: { iracingMemberId: "544198" },
  });

  if (eigner) {
    const reg = await prisma.registration.findUnique({
      where: {
        seasonId_userId: { seasonId: season.id, userId: eigner.id },
      },
    });
    if (reg) {
      // Race results cascade-delete via Registration onDelete: Cascade
      await prisma.registration.delete({ where: { id: reg.id } });
      console.log(`Deleted registration of Florian Eigner.`);
    } else {
      console.log("Florian Eigner had no registration.");
    }
  } else {
    console.log("No user found for iRacing ID 544198.");
  }

  const team = await prisma.team.findUnique({
    where: { seasonId_name: { seasonId: season.id, name: "Team Phase 2" } },
  });
  if (team) {
    // Detach any leftover registrations (shouldn't be any after the above)
    await prisma.registration.updateMany({
      where: { teamId: team.id },
      data: { teamId: null },
    });
    await prisma.fPRAward.deleteMany({ where: { teamId: team.id } });
    await prisma.team.delete({ where: { id: team.id } });
    console.log(`Deleted Team Phase 2.`);
  } else {
    console.log("Team Phase 2 not found.");
  }
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

npx tsx scripts/delete-eigner-and-team.ts
