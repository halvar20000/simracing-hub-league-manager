#!/usr/bin/env bash
# Two things in one go:
#   1. Patch the CSV import action to understand iRacing's hosted-session
#      format (metadata header lines, "Fin Pos"/"Cust ID"/"Laps Comp"
#      column names, "Running" status for classified finishers).
#   2. Write a one-shot test-data script that creates the 11 drivers
#      extracted from the two CSVs and assigns them to 3 test teams in
#      the most recent CAS GT3 WCT season.
#
# Usage:
#   bash test-data-and-csv-fix.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "CSV parser fix + test data registration"
echo "============================================="

# ------------------------------------------------------------
# 1. Patched CSV import action
# ------------------------------------------------------------
echo ">>> Patching CSV import action for iRacing hosted-session format..."

cat > src/lib/actions/csv-import.ts <<'EOF'
"use server";

import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import { parseTimeToMs } from "@/lib/time";
import type { FinishStatus } from "@prisma/client";

interface IRacingRow {
  [key: string]: string | undefined;
}

function findHeader(
  headers: string[],
  variants: string[]
): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerNorm = headers.map(norm);
  for (const v of variants) {
    const i = headerNorm.indexOf(norm(v));
    if (i >= 0) return headers[i];
  }
  return null;
}

/**
 * iRacing hosted-session CSVs have 7 lines of metadata before the real
 * header row. Find the header line by looking for "Fin Pos" + "Cust ID".
 */
function detectHeaderLineIndex(text: string): number {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i].toLowerCase();
    if (
      (line.includes('"fin pos"') ||
        line.includes("fin pos,") ||
        line.includes('"finish pos"') ||
        line.includes('"pos"')) &&
      (line.includes('"cust id"') ||
        line.includes("cust id,") ||
        line.includes('"custid"'))
    ) {
      return i;
    }
  }
  return 0;
}

export async function importResultsCsv(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  const admin = await requireAdmin();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=No+file+selected`
    );
  }

  const rawText = await file.text();
  const headerIdx = detectHeaderLineIndex(rawText);
  const csvText = rawText
    .split(/\r?\n/)
    .slice(headerIdx)
    .join("\n");

  const parsed = Papa.parse<IRacingRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=Could+not+read+CSV+headers`
    );
  }

  const fields = parsed.meta.fields;
  const colCustID = findHeader(fields, [
    "custid",
    "customerid",
    "memberid",
    "iracingmemberid",
    "irid",
  ]);
  const colPos = findHeader(fields, [
    "finpos",
    "pos",
    "finishposition",
    "finishpos",
    "position",
    "finishingposition",
  ]);
  const colLaps = findHeader(fields, [
    "lapscomp",
    "lapsdone",
    "laps",
    "lapscompleted",
    "lapscomplete",
  ]);
  const colInc = findHeader(fields, ["inc", "incidents", "incs"]);
  const colTotalTime = findHeader(fields, [
    "totaltime",
    "racetime",
    "interval",
  ]);
  const colBestTime = findHeader(fields, [
    "fastestlaptime",
    "bestlaptime",
    "fastestlap",
    "besttime",
    "bestlap",
  ]);
  const colOut = findHeader(fields, [
    "out",
    "reasonout",
    "dnfreason",
    "status",
    "outcome",
  ]);
  const colCarNum = findHeader(fields, ["car", "carnum", "carnumber"]);

  if (!colCustID || !colPos) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=CSV+missing+required+columns+(Cust+ID+and+Fin+Pos+required)`
    );
  }

  // Compute max laps for raceDistancePct (winner's lap count = 100%)
  let maxLaps = 0;
  if (colLaps) {
    for (const row of parsed.data) {
      const l = parseInt(row[colLaps] ?? "0", 10) || 0;
      if (l > maxLaps) maxLaps = l;
    }
  }

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const custIdRaw = String(row[colCustID] ?? "").trim();
    if (!custIdRaw) {
      skipped++;
      errors.push({ row: i + 2, reason: "Cust ID is empty" });
      continue;
    }
    const custId = custIdRaw.replace(/[^0-9]/g, "");

    const reg = await prisma.registration.findFirst({
      where: {
        seasonId,
        status: "APPROVED",
        user: { iracingMemberId: custId },
      },
    });

    if (!reg) {
      skipped++;
      errors.push({
        row: i + 2,
        reason: `No approved registration for iRacing ID ${custId}`,
      });
      continue;
    }

    const finishPosition = parseInt(row[colPos] ?? "0", 10) || 0;
    const lapsCompleted = colLaps
      ? parseInt(row[colLaps] ?? "0", 10) || 0
      : 0;
    const raceDistancePct =
      maxLaps > 0 ? Math.round((lapsCompleted / maxLaps) * 100) : 100;
    const totalTimeMs = colTotalTime
      ? parseTimeToMs(row[colTotalTime])
      : null;
    const bestLapTimeMs = colBestTime
      ? parseTimeToMs(row[colBestTime])
      : null;
    const incidents = colInc
      ? parseInt(row[colInc] ?? "0", 10) || 0
      : 0;
    const outReason = colOut ? String(row[colOut] ?? "").trim() : "";

    let finishStatus: FinishStatus = "CLASSIFIED";
    if (outReason && outReason.toLowerCase() !== "running") {
      const lc = outReason.toLowerCase();
      if (lc.includes("disq") || lc.includes("dsq")) finishStatus = "DSQ";
      else if (lc.includes("dns") || lc.includes("did not start"))
        finishStatus = "DNS";
      else finishStatus = "DNF";
    }

    await prisma.raceResult.upsert({
      where: {
        roundId_registrationId: { roundId, registrationId: reg.id },
      },
      create: {
        roundId,
        registrationId: reg.id,
        finishStatus,
        finishPosition,
        lapsCompleted,
        raceDistancePct,
        totalTimeMs,
        bestLapTimeMs,
        incidents,
      },
      update: {
        finishStatus,
        finishPosition,
        lapsCompleted,
        raceDistancePct,
        totalTimeMs,
        bestLapTimeMs,
        incidents,
      },
    });
    imported++;
  }

  await prisma.csvImport.create({
    data: {
      roundId,
      uploadedById: admin.id,
      originalFilename: file.name,
      rowsImported: imported,
      rowsSkipped: skipped,
      errorLog: errors.length > 0 ? (errors as object) : undefined,
    },
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );

  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?imported=${imported}&skipped=${skipped}`
  );
}
EOF

# ------------------------------------------------------------
# 2. Test-data registration script
# ------------------------------------------------------------
echo ">>> Writing test-data registration script..."
ensure_dir() { mkdir -p "$1"; }
ensure_dir scripts

cat > scripts/register-test-drivers.ts <<'EOF'
/**
 * One-shot test-data script.
 *
 * Creates 11 test User + Registration rows (drivers extracted from the two
 * sample CSVs) in the most recent season of the CAS GT3 WCT league, plus
 * 3 test teams. All registrations are set to APPROVED.
 *
 * Run:
 *   npx tsx scripts/register-test-drivers.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const LEAGUE_SLUG = "cas-gt3-wct";

interface TestDriver {
  iracingId: string;
  firstName: string;
  lastName: string;
  startNumber: number | null;
  team: "A" | "B" | "C";
}

const drivers: TestDriver[] = [
  { iracingId: "633394",  firstName: "Mike",        lastName: "Zocher",       startNumber: 26,  team: "A" },
  { iracingId: "574387",  firstName: "Dennis Ulli", lastName: "Richter",      startNumber: 63,  team: "A" },
  { iracingId: "1021560", firstName: "Klaus",       lastName: "Oberlaender",  startNumber: 860, team: "A" },
  { iracingId: "634477",  firstName: "Antonio",     lastName: "Cursio",       startNumber: 555, team: "A" },
  { iracingId: "227997",  firstName: "Mike",        lastName: "Girenz",       startNumber: 33,  team: "B" },
  { iracingId: "646405",  firstName: "Justin",      lastName: "Christiansen", startNumber: 116, team: "B" },
  { iracingId: "974264",  firstName: "Andy",        lastName: "Weber",        startNumber: 5,   team: "B" },
  { iracingId: "384541",  firstName: "Benjamin",    lastName: "Warnow",       startNumber: 112, team: "B" },
  { iracingId: "1200858", firstName: "Lukas",       lastName: "Zörlaut",      startNumber: 89,  team: "C" },
  { iracingId: "841362",  firstName: "Bernhard",    lastName: "Wlach",        startNumber: 118, team: "C" },
  { iracingId: "439230",  firstName: "Alexander",   lastName: "Thieme2",      startNumber: 812, team: "C" },
];

const teamNames = {
  A: "Test Team A",
  B: "Test Team B",
  C: "Test Team C",
} as const;

async function main() {
  // Find the league
  const league = await prisma.league.findUnique({
    where: { slug: LEAGUE_SLUG },
  });
  if (!league) {
    console.error(`League "${LEAGUE_SLUG}" not found.`);
    process.exit(1);
  }

  // Find the most recent season for the league
  const season = await prisma.season.findFirst({
    where: { leagueId: league.id },
    orderBy: { createdAt: "desc" },
  });
  if (!season) {
    console.error(
      `No season found for "${LEAGUE_SLUG}". Create one in admin first.`
    );
    process.exit(1);
  }
  console.log(`Using season: ${season.name} ${season.year} (id ${season.id})`);

  // Find an admin user to mark as approver
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
  if (!admin) {
    console.error("No admin user found — sign in once first.");
    process.exit(1);
  }

  // Create / reuse the 3 teams
  const teamRecords: Record<"A" | "B" | "C", string> = {
    A: "",
    B: "",
    C: "",
  };
  for (const key of ["A", "B", "C"] as const) {
    const name = teamNames[key];
    const team = await prisma.team.upsert({
      where: { seasonId_name: { seasonId: season.id, name } },
      update: {},
      create: { seasonId: season.id, name },
    });
    teamRecords[key] = team.id;
    console.log(`Team ${key}: ${name} (${team.id})`);
  }

  // Create users + registrations
  for (const d of drivers) {
    const email = `iracing-${d.iracingId}@test.simracing-hub.com`;

    const user = await prisma.user.upsert({
      where: { iracingMemberId: d.iracingId },
      update: {
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        name: `${d.firstName} ${d.lastName}`,
      },
      create: {
        iracingMemberId: d.iracingId,
        firstName: d.firstName,
        lastName: d.lastName,
        email,
        name: `${d.firstName} ${d.lastName}`,
        role: "DRIVER",
      },
    });

    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId: season.id, userId: user.id } },
      update: {
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId: teamRecords[d.team],
        approvedById: admin.id,
        approvedAt: new Date(),
      },
      create: {
        seasonId: season.id,
        userId: user.id,
        status: "APPROVED",
        startNumber: d.startNumber,
        teamId: teamRecords[d.team],
        approvedById: admin.id,
        approvedAt: new Date(),
      },
    });

    console.log(
      `  ${d.iracingId.padStart(7)}  ${d.firstName} ${d.lastName} → Team ${d.team}`
    );
  }

  console.log(
    `\nDone. ${drivers.length} test drivers registered in 3 teams.`
  );
  console.log(
    `Now upload the two CSVs:`
  );
  console.log(
    `  Round 1 (Summit Point) → eventresult_84768412_0.csv`
  );
  console.log(
    `  Round 2 (Mugello) → eventresult_85122537_0.csv`
  );
  console.log(
    `\nThen visit /leagues/${LEAGUE_SLUG}/seasons/${season.id}/standings`
  );
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

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "CSV parser patched + test data script ready."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Run the registration script (creates 11 drivers + 3 teams in your"
echo "   most recent CAS GT3 WCT season):"
echo "      npx tsx scripts/register-test-drivers.ts"
echo ""
echo "2. Verify the roster in admin → CAS GT3 WCT → your season → Roster tab"
echo "   (you should see 11 APPROVED entries)."
echo ""
echo "3. Restart dev server (so the patched parser is loaded):"
echo "      Ctrl-C in the terminal running npm run dev, then:"
echo "      npm run dev"
echo ""
echo "4. Upload CSVs:"
echo "   a) Round 1 → click 'Import CSV' → upload eventresult_84768412_0.csv"
echo "      (Summit Point — 4 drivers, all DNF)"
echo "   b) Round 2 → click 'Import CSV' → upload eventresult_85122537_0.csv"
echo "      (Mugello — 8 drivers, P1 + P2 classified, P3-P8 disconnected)"
echo ""
echo "5. Check the public Standings page. Expected:"
echo "   - Driver Mike Zocher (#26): 35 pos + 5 part = 40 pts"
echo "   - Driver Dennis Ulli Richter (#63): 33 + 5 = 38 pts"
echo "   - Klaus Oberlaender: 0 (DNF in both rounds)"
echo "   - Others: 0 (DNF)"
echo "   - Test Team A: 78 race pts (Mike 40 + Dennis 38, best 2) + FPR"
echo "   - Test Team B: 0 race pts + FPR (all 0 incidents at Mugello = 3 FPR)"
echo "   - Test Team C: 0 race pts + FPR (3 drivers at Summit, low incidents)"
echo ""
echo "6. Commit and push when satisfied:"
echo "      git add -A"
echo "      git commit -m 'Fix CSV parser for iRacing hosted-session format + test data script'"
echo "      git push"
echo ""
