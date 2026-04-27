import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FPR_TIERS = [
  { max: 15, points: 3 },
  { max: 20, points: 2 },
  { max: 25, points: 1 },
];

async function main() {
  console.log("--- Seeding scoring systems ---");

  const sflCup = await prisma.scoringSystem.upsert({
    where: { name: "CAS SFL Cup" },
    update: {},
    create: {
      name: "CAS SFL Cup",
      description: "20-position scoring with 75% participation threshold",
      pointsTable: {
        "1": 25, "2": 22, "3": 19, "4": 17, "5": 16, "6": 15, "7": 14, "8": 13,
        "9": 12, "10": 11, "11": 10, "12": 9, "13": 8, "14": 7, "15": 6,
        "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
      },
      participationPoints: 5,
      participationMinDistancePct: 75,
      fprEnabled: false,
      fprTiers: FPR_TIERS,
      fprMode: "ALL_TEAMS_TIERED",
    },
  });

  const gt4Masters = await prisma.scoringSystem.upsert({
    where: { name: "CAS GT4 Masters" },
    update: {},
    create: {
      name: "CAS GT4 Masters",
      description: "15-position scoring with 75% participation threshold",
      pointsTable: {
        "1": 30, "2": 25, "3": 21, "4": 18, "5": 16, "6": 14, "7": 12, "8": 10,
        "9": 8, "10": 6, "11": 5, "12": 4, "13": 3, "14": 2, "15": 1,
      },
      participationPoints: 5,
      participationMinDistancePct: 75,
      fprEnabled: false,
      fprTiers: FPR_TIERS,
      fprMode: "ALL_TEAMS_TIERED",
    },
  });

  const gt3Wct = await prisma.scoringSystem.upsert({
    where: { name: "CAS GT3 WCT" },
    update: {},
    create: {
      name: "CAS GT3 WCT",
      description: "20-position scoring with 75% participation threshold",
      pointsTable: {
        "1": 35, "2": 33, "3": 31, "4": 29, "5": 27, "6": 25, "7": 23, "8": 21,
        "9": 19, "10": 17, "11": 15, "12": 13, "13": 11, "14": 9, "15": 7,
        "16": 5, "17": 4, "18": 3, "19": 2, "20": 1,
      },
      participationPoints: 5,
      participationMinDistancePct: 75,
      fprEnabled: false,
      fprTiers: FPR_TIERS,
      fprMode: "ALL_TEAMS_TIERED",
    },
  });

  const iec = await prisma.scoringSystem.upsert({
    where: { name: "CAS IEC" },
    update: {},
    create: {
      name: "CAS IEC",
      description: "30-position endurance scoring with 50% participation threshold",
      pointsTable: {
        "1": 100, "2": 90, "3": 80, "4": 75, "5": 70, "6": 65, "7": 60, "8": 55,
        "9": 50, "10": 45, "11": 35, "12": 30, "13": 25, "14": 20, "15": 18,
        "16": 16, "17": 14, "18": 12, "19": 10, "20": 8, "21": 6, "22": 4,
        "23": 3, "24": 2, "25": 1, "26": 1, "27": 1, "28": 1, "29": 1, "30": 1,
      },
      participationPoints: 5,
      participationMinDistancePct: 50,
      fprEnabled: true,
      fprTiers: FPR_TIERS,
      fprMode: "ALL_TEAMS_TIERED",
    },
  });

  console.log("Scoring systems seeded:", {
    sflCup: sflCup.id,
    gt4Masters: gt4Masters.id,
    gt3Wct: gt3Wct.id,
    iec: iec.id,
  });

  // ---- Auto-promote first user to ADMIN if no admins yet ----
  console.log("--- Checking for admin user ---");

  const anyAdmin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  let adminUser = anyAdmin;

  if (!anyAdmin) {
    const firstUser = await prisma.user.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (firstUser) {
      adminUser = await prisma.user.update({
        where: { id: firstUser.id },
        data: { role: "ADMIN" },
      });
      console.log(`Promoted ${firstUser.name ?? firstUser.email} to ADMIN.`);
    } else {
      console.log("No users in the database yet.");
      console.log("Sign in once at your app, then re-run the seed.");
    }
  } else {
    console.log(`Existing admin found: ${anyAdmin.name ?? anyAdmin.email}`);
  }

  if (!adminUser) {
    console.log("Skipping league creation (no user available as createdBy).");
    return;
  }

  // ---- Seed CAS leagues ----
  console.log("--- Seeding CAS leagues ---");

  const leagues = [
    {
      name: "CAS GT3 WCT",
      slug: "cas-gt3-wct",
      description: "GT3 World Championship Tour",
    },
    {
      name: "CAS IEC",
      slug: "cas-iec",
      description: "Intercontinental Endurance Championship",
    },
    {
      name: "CAS Combined Cup",
      slug: "cas-combined-cup",
      description: "Combined Cup multi-class series",
    },
    {
      name: "CAS SFL Cup",
      slug: "cas-sfl-cup",
      description: "SFL Cup sprint series",
    },
    {
      name: "CAS PCCD",
      slug: "cas-pccd",
      description: "PCCD sprint series",
    },
    {
      name: "CAS TSS GT4",
      slug: "cas-tss-gt4",
      description: "TSS GT4 series",
    },
  ];

  for (const league of leagues) {
    await prisma.league.upsert({
      where: { slug: league.slug },
      update: {},
      create: { ...league, createdById: adminUser.id },
    });
  }

  console.log(`Seeded ${leagues.length} CAS leagues.`);
  console.log("--- Done ---");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
