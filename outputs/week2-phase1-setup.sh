#!/usr/bin/env bash
# Week 2 Phase 1 — Full Prisma schema + CAS seed data
# Writes the complete domain schema (17 tables) and a seed script that pre-loads
# the four CAS scoring systems and six CAS leagues.
#
# Usage:
#   bash week2-phase1-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: Project not found at $PROJECT_DIR"
  echo "Did Week 1 complete? Make sure ~/Nextcloud/AI/league-manager exists."
  exit 1
fi

cd "$PROJECT_DIR"

echo "============================================="
echo "Week 2 Phase 1 — Schema + CAS seed data"
echo "============================================="

# ------------------------------------------------------------
# 1. Install tsx for running TypeScript seed
# ------------------------------------------------------------
echo ""
echo ">>> Installing tsx (TypeScript runner for the seed script)..."
echo ""
npm install -D tsx

# ------------------------------------------------------------
# 2. Configure seed script in package.json
# ------------------------------------------------------------
echo ""
echo ">>> Configuring Prisma seed in package.json..."
echo ""
npm pkg set "prisma.seed=tsx prisma/seed.ts"

# ------------------------------------------------------------
# 3. Write the full Prisma schema
# ------------------------------------------------------------
echo ""
echo ">>> Writing full Prisma schema (17 tables)..."
echo ""

cat > prisma/schema.prisma <<'PRISMA_EOF'
// Simracing-Hub's League Manager — full domain schema
// Auth.js tables + League/Season/Round/Registration + Results/Scoring + Reporting

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ==========================================
// Auth.js tables
// ==========================================

model User {
  id              String    @id @default(cuid())
  name            String?
  email           String?   @unique
  emailVerified   DateTime?
  image           String?

  firstName       String?
  lastName        String?
  iracingMemberId String?   @unique
  role            Role      @default(DRIVER)
  isActive        Boolean   @default(true)

  accounts        Account[]
  sessions        Session[]

  // Domain back-relations
  leaguesCreated         League[]                       @relation("LeagueCreatedBy")
  registrations          Registration[]
  approvedRegistrations  Registration[]                 @relation("RegistrationApprovedBy")
  csvImports             CsvImport[]
  incidentReports        IncidentReport[]
  incidentEvidence       IncidentReportEvidence[]
  incidentComments       IncidentReportComment[]
  incidentDecisions      IncidentDecision[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String
  providerAccountId String
  refresh_token     String? @db.Text
  access_token      String? @db.Text
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String? @db.Text
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
}

model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
}

// ==========================================
// League domain
// ==========================================

model League {
  id          String    @id @default(cuid())
  name        String
  slug        String    @unique
  description String?
  logoUrl     String?

  createdById String
  createdBy   User      @relation("LeagueCreatedBy", fields: [createdById], references: [id])

  seasons     Season[]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}

model Season {
  id                  String          @id @default(cuid())
  leagueId            String
  league              League          @relation(fields: [leagueId], references: [id], onDelete: Cascade)
  name                String
  year                Int
  status              SeasonStatus    @default(DRAFT)
  startsOn            DateTime?
  endsOn              DateTime?
  isMulticlass        Boolean         @default(false)
  proAmEnabled        Boolean         @default(false)

  scoringSystemId     String
  scoringSystem       ScoringSystem   @relation(fields: [scoringSystemId], references: [id])

  teamScoringMode     TeamScoringMode @default(NONE)
  teamScoringBestN    Int?

  carClasses          CarClass[]
  cars                Car[]
  teams               Team[]
  rounds              Round[]
  registrations       Registration[]

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model CarClass {
  id            String         @id @default(cuid())
  seasonId      String
  season        Season         @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  name          String
  shortCode     String
  displayOrder  Int            @default(0)

  cars          Car[]
  registrations Registration[]
  fprAwards     FPRAward[]

  @@unique([seasonId, shortCode])
}

model Car {
  id            String         @id @default(cuid())
  seasonId      String
  season        Season         @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  carClassId    String
  carClass      CarClass       @relation(fields: [carClassId], references: [id], onDelete: Cascade)
  name          String
  iracingCarId  Int?

  registrations Registration[]
}

model Team {
  id            String         @id @default(cuid())
  seasonId      String
  season        Season         @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  name          String
  shortName     String?
  logoUrl       String?

  registrations Registration[]
  fprAwards     FPRAward[]

  @@unique([seasonId, name])
}

model Round {
  id                      String           @id @default(cuid())
  seasonId                String
  season                  Season           @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  roundNumber             Int
  name                    String
  track                   String
  trackConfig             String?
  startsAt                DateTime
  countsForChampionship   Boolean          @default(true)
  raceLengthMinutes       Int?
  status                  RoundStatus      @default(UPCOMING)

  raceResults             RaceResult[]
  csvImports              CsvImport[]
  incidentReports         IncidentReport[]
  fprAwards               FPRAward[]
  penalties               Penalty[]

  @@unique([seasonId, roundNumber])
}

model Registration {
  id              String              @id @default(cuid())
  seasonId        String
  season          Season              @relation(fields: [seasonId], references: [id], onDelete: Cascade)
  userId          String
  user            User                @relation(fields: [userId], references: [id])

  status          RegistrationStatus  @default(PENDING)
  startNumber     Int?

  teamId          String?
  team            Team?               @relation(fields: [teamId], references: [id])
  carClassId      String?
  carClass        CarClass?           @relation(fields: [carClassId], references: [id])
  carId           String?
  car             Car?                @relation(fields: [carId], references: [id])
  proAmClass      ProAmClass?

  notes           String?
  approvedById    String?
  approvedBy      User?               @relation("RegistrationApprovedBy", fields: [approvedById], references: [id])
  approvedAt      DateTime?

  raceResults             RaceResult[]
  reportedIncidents       IncidentReport[]                @relation("IncidentReporter")
  involvedInIncidents     IncidentReportInvolvedDriver[]
  penalties               Penalty[]

  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  @@unique([seasonId, userId])
}

model RaceResult {
  id                          String        @id @default(cuid())
  roundId                     String
  round                       Round         @relation(fields: [roundId], references: [id], onDelete: Cascade)
  registrationId              String
  registration                Registration  @relation(fields: [registrationId], references: [id], onDelete: Cascade)

  finishPosition              Int
  classPosition               Int?
  lapsCompleted               Int           @default(0)
  raceDistancePct             Int           @default(0)
  totalTimeMs                 Int?
  bestLapTimeMs               Int?
  incidents                   Int           @default(0)
  finishStatus                FinishStatus  @default(CLASSIFIED)

  rawPointsAwarded            Int           @default(0)
  participationPointsAwarded  Int           @default(0)
  manualPenaltyPoints         Int           @default(0)
  manualPenaltyReason         String?
  notes                       String?

  createdAt                   DateTime      @default(now())
  updatedAt                   DateTime      @updatedAt

  @@unique([roundId, registrationId])
}

model ScoringSystem {
  id                            String    @id @default(cuid())
  name                          String    @unique
  description                   String?
  pointsTable                   Json
  participationPoints           Int       @default(0)
  participationMinDistancePct   Int       @default(75)
  bonusFastestLap               Int?
  bonusPole                     Int?
  bonusMostLapsLed              Int?
  dropWorstNRounds              Int?
  fprEnabled                    Boolean   @default(false)
  fprTiers                      Json?
  fprMode                       FprMode   @default(ALL_TEAMS_TIERED)

  seasons                       Season[]
}

model FPRAward {
  id                  String      @id @default(cuid())
  roundId             String
  round               Round       @relation(fields: [roundId], references: [id], onDelete: Cascade)
  teamId              String
  team                Team        @relation(fields: [teamId], references: [id])
  carClassId          String?
  carClass            CarClass?   @relation(fields: [carClassId], references: [id])
  teamIncidentTotal   Int
  fprPointsAwarded    Int

  @@unique([roundId, teamId, carClassId])
}

model CsvImport {
  id                String    @id @default(cuid())
  roundId           String
  round             Round     @relation(fields: [roundId], references: [id], onDelete: Cascade)
  uploadedById      String
  uploadedBy        User      @relation(fields: [uploadedById], references: [id])
  originalFilename  String
  rowsImported      Int       @default(0)
  rowsSkipped       Int       @default(0)
  errorLog          Json?

  createdAt         DateTime  @default(now())
}

// ==========================================
// Reporting system
// ==========================================

model IncidentReport {
  id                          String          @id @default(cuid())
  roundId                     String
  round                       Round           @relation(fields: [roundId], references: [id], onDelete: Cascade)
  reporterUserId              String
  reporterUser                User            @relation(fields: [reporterUserId], references: [id])
  reporterRegistrationId      String
  reporterRegistration        Registration    @relation("IncidentReporter", fields: [reporterRegistrationId], references: [id])

  lapNumber                   Int?
  turnOrSector                String?
  description                 String
  status                      IncidentStatus  @default(SUBMITTED)
  submittedAt                 DateTime        @default(now())

  involvedDrivers             IncidentReportInvolvedDriver[]
  evidence                    IncidentReportEvidence[]
  comments                    IncidentReportComment[]
  decision                    IncidentDecision?

  createdAt                   DateTime        @default(now())
  updatedAt                   DateTime        @updatedAt
}

model IncidentReportInvolvedDriver {
  id                  String          @id @default(cuid())
  incidentReportId    String
  incidentReport      IncidentReport  @relation(fields: [incidentReportId], references: [id], onDelete: Cascade)
  registrationId      String
  registration        Registration    @relation(fields: [registrationId], references: [id])
  role                ParticipantRole

  @@unique([incidentReportId, registrationId])
}

model IncidentReportEvidence {
  id                  String          @id @default(cuid())
  incidentReportId    String
  incidentReport      IncidentReport  @relation(fields: [incidentReportId], references: [id], onDelete: Cascade)
  kind                EvidenceKind
  content             String
  addedByUserId       String
  addedByUser         User            @relation(fields: [addedByUserId], references: [id])

  createdAt           DateTime        @default(now())
}

model IncidentReportComment {
  id                  String          @id @default(cuid())
  incidentReportId    String
  incidentReport      IncidentReport  @relation(fields: [incidentReportId], references: [id], onDelete: Cascade)
  authorUserId        String
  authorUser          User            @relation(fields: [authorUserId], references: [id])
  body                String
  isInternal          Boolean         @default(true)

  createdAt           DateTime        @default(now())
}

model IncidentDecision {
  id                  String          @id @default(cuid())
  incidentReportId    String          @unique
  incidentReport      IncidentReport  @relation(fields: [incidentReportId], references: [id], onDelete: Cascade)
  decidedByUserId     String
  decidedByUser       User            @relation(fields: [decidedByUserId], references: [id])
  decidedAt           DateTime        @default(now())
  verdict             Verdict
  publicSummary       String
  internalNotes       String?
  publishedAt         DateTime?

  penalties           Penalty[]

  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt
}

model Penalty {
  id                          String              @id @default(cuid())
  registrationId              String
  registration                Registration        @relation(fields: [registrationId], references: [id], onDelete: Cascade)
  roundId                     String
  round                       Round               @relation(fields: [roundId], references: [id], onDelete: Cascade)

  source                      PenaltySource
  sourceIncidentDecisionId    String?
  sourceIncidentDecision      IncidentDecision?   @relation(fields: [sourceIncidentDecisionId], references: [id])

  type                        PenaltyType
  timePenaltySeconds          Int?
  pointsValue                 Int?
  gridPositions               Int?
  reason                      String
  appliedAt                   DateTime            @default(now())

  createdAt                   DateTime            @default(now())
}

// ==========================================
// Enums
// ==========================================

enum Role {
  ADMIN
  DRIVER
}

enum SeasonStatus {
  DRAFT
  OPEN_REGISTRATION
  ACTIVE
  COMPLETED
}

enum RoundStatus {
  UPCOMING
  IN_PROGRESS
  COMPLETED
}

enum RegistrationStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

enum ProAmClass {
  PRO
  AM
}

enum FinishStatus {
  CLASSIFIED
  DNF
  DNS
  DSQ
}

enum TeamScoringMode {
  NONE
  SUM_ALL
  SUM_BEST_N
}

enum FprMode {
  LOWEST_TEAM_ONLY
  ALL_TEAMS_TIERED
}

enum IncidentStatus {
  SUBMITTED
  UNDER_REVIEW
  DECIDED
  DISMISSED
}

enum ParticipantRole {
  REPORTER
  ACCUSED
  WITNESS
}

enum EvidenceKind {
  YOUTUBE_LINK
  URL
  IRACING_REPLAY_REF
  IMAGE_URL
  TEXT
}

enum Verdict {
  NO_ACTION
  WARNING
  REPRIMAND
  TIME_PENALTY
  POINTS_DEDUCTION
  GRID_PENALTY_NEXT_ROUND
  SUSPENSION
}

enum PenaltySource {
  INCIDENT_DECISION
  ADMIN_MANUAL
  IRACECONTROL_IMPORT
}

enum PenaltyType {
  TIME_PENALTY
  POINTS_DEDUCTION
  GRID_PENALTY
  WARNING
}
PRISMA_EOF

# ------------------------------------------------------------
# 4. Write the seed script
# ------------------------------------------------------------
echo ""
echo ">>> Writing seed script (4 scoring systems + 6 CAS leagues)..."
echo ""

cat > prisma/seed.ts <<'SEED_EOF'
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
      fprEnabled: true,
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
      fprEnabled: true,
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
      fprEnabled: true,
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
SEED_EOF

# ------------------------------------------------------------
# 5. Done — print next steps
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "Schema and seed files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Push the new schema to Neon (creates 13 new tables):"
echo "   npx prisma db push"
echo ""
echo "2. Generate the Prisma client (needed after schema changes):"
echo "   npx prisma generate"
echo ""
echo "3. Run the seed (creates 4 scoring systems + 6 CAS leagues +"
echo "   auto-promotes you to ADMIN):"
echo "   npx prisma db seed"
echo ""
echo "4. Verify in Prisma Studio:"
echo "   npx prisma studio"
echo "   Check: User table (your role should now be ADMIN),"
echo "          ScoringSystem table (4 rows),"
echo "          League table (6 rows)."
echo ""
echo "5. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 2 Phase 1: full schema + CAS seed data'"
echo "   git push"
echo "   (Vercel will redeploy automatically)"
echo ""
