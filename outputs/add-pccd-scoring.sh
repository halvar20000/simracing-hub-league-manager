#!/usr/bin/env bash
# Add the PCCD scoring system (Gesamt + Silverclass tables).
# Adds a classPointsTable JSON field to ScoringSystem, creates the PCCD
# scoring system, and assigns it to the most recent CAS PCCD season.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Add classPointsTable field to ScoringSystem (idempotent)
# ------------------------------------------------------------
echo ">>> Adding classPointsTable to ScoringSystem..."
node -e "
const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('classPointsTable')) {
  console.log('  Already present.');
} else {
  s = s.replace(
    /(model ScoringSystem \{[\s\S]*?pointsTable\s+Json)/,
    '\$1\n  classPointsTable              Json?'
  );
  fs.writeFileSync(p, s);
  console.log('  Added classPointsTable field.');
}
"

# ------------------------------------------------------------
# 2. Push schema
# ------------------------------------------------------------
echo ">>> Pushing schema to Neon..."
npx prisma db push
npx prisma generate

# ------------------------------------------------------------
# 3. Create PCCD scoring system + assign to PCCD seasons
# ------------------------------------------------------------
echo ">>> Creating CAS PCCD scoring system..."
mkdir -p scripts

cat > scripts/add-pccd-scoring.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FPR_TIERS = [
  { max: 15, points: 3 },
  { max: 20, points: 2 },
  { max: 25, points: 1 },
];

async function main() {
  // Create or update the scoring system
  const scoring = await prisma.scoringSystem.upsert({
    where: { name: "CAS PCCD" },
    update: {
      pointsTable: {
        "1": 41, "2": 35, "3": 30, "4": 26, "5": 23,
        "6": 20, "7": 18, "8": 16, "9": 14, "10": 12,
        "11": 10, "12": 9, "13": 8, "14": 7, "15": 6,
        "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
      },
      classPointsTable: {
        "1": 20, "2": 16, "3": 13, "4": 10, "5": 8,
        "6": 6, "7": 4, "8": 3, "9": 2, "10": 1,
      },
    },
    create: {
      name: "CAS PCCD",
      description:
        "Porsche Community Cup Deutschland — 20-position Gesamt + 10-position Silverclass. Heat format: 2 races of 25 min, race 2 reverse grid for top 8.",
      pointsTable: {
        "1": 41, "2": 35, "3": 30, "4": 26, "5": 23,
        "6": 20, "7": 18, "8": 16, "9": 14, "10": 12,
        "11": 10, "12": 9, "13": 8, "14": 7, "15": 6,
        "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
      },
      classPointsTable: {
        "1": 20, "2": 16, "3": 13, "4": 10, "5": 8,
        "6": 6, "7": 4, "8": 3, "9": 2, "10": 1,
      },
      participationPoints: 5,
      participationMinDistancePct: 75,
      fprEnabled: true,
      fprTiers: FPR_TIERS,
      fprMode: "ALL_TEAMS_TIERED",
    },
  });
  console.log("Scoring system saved:", scoring.id);

  // Assign to most recent CAS PCCD season + enable proAm
  const league = await prisma.league.findUnique({
    where: { slug: "cas-pccd" },
  });
  if (!league) {
    console.log("League cas-pccd not found — scoring system created but not assigned.");
    return;
  }
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.log("No season in cas-pccd — scoring system created but not assigned.");
    return;
  }
  await prisma.season.update({
    where: { id: season.id },
    data: {
      scoringSystemId: scoring.id,
      proAmEnabled: true,
    },
  });
  console.log(`Assigned CAS PCCD scoring + Pro/Am to ${season.name} ${season.year}.`);
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

npx tsx scripts/add-pccd-scoring.ts

echo ""
echo "Done."
echo ""
echo "What works now:"
echo "  - PCCD seasons use the 41-35-30… Gesamt scoring for overall standings"
echo "  - Pro/Am is enabled, so once you tag drivers as AM in the roster,"
echo "    a separate Silver standings section appears"
echo ""
echo "What still needs a follow-up patch:"
echo "  - Silverclass standings currently use the same Gesamt points table,"
echo "    not the 20-16-13 classPointsTable. To use the proper Silverclass"
echo "    scoring, the standings library needs to compute class-position"
echo "    rankings within AM drivers per race. Let me know when you want this"
echo "    and I'll wire it up."
