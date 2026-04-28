"use server";

import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import { parseTimeToMs } from "@/lib/time";
import type { FinishStatus, Registration } from "@prisma/client";

interface CsvRow {
  [key: string]: string | undefined;
}

type Format = "iracing" | "irleaguemanager";

interface FormatDetection {
  headerIdx: number;
  delimiter: string;
  format: Format;
}

function findHeader(headers: string[], variants: string[]): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerNorm = headers.map(norm);
  for (const v of variants) {
    const i = headerNorm.indexOf(norm(v));
    if (i >= 0) return headers[i];
  }
  return null;
}

function detectFormat(text: string): FormatDetection {
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < Math.min(lines.length, 40); i++) {
    const line = lines[i].toLowerCase();

    // iRacing hosted-session format
    if (line.includes("fin pos") && line.includes("cust id")) {
      return { headerIdx: i, delimiter: ",", format: "iracing" };
    }

    // iRLeagueManager: semicolon-delimited, has Position + Name + Race Points
    if (
      line.includes("position") &&
      line.includes("name") &&
      (line.includes("race points") || line.includes("total points"))
    ) {
      const semicolons = (lines[i].match(/;/g) ?? []).length;
      const commas = (lines[i].match(/,/g) ?? []).length;
      return {
        headerIdx: i,
        delimiter: semicolons > commas ? ";" : ",",
        format: "irleaguemanager",
      };
    }
  }
  // Fallback — assume iRacing
  return { headerIdx: 0, delimiter: ",", format: "iracing" };
}

function stripTrailingDigits(name: string): string {
  return name.replace(/\d+$/, "").trim();
}

async function findRegistrationByName(
  seasonId: string,
  rawName: string
): Promise<Registration | null> {
  const name = rawName.trim();
  if (!name) return null;

  // 1. Exact (case-insensitive)
  let reg = await prisma.registration.findFirst({
    where: {
      seasonId,
      status: "APPROVED",
      user: { name: { equals: name, mode: "insensitive" } },
    },
  });
  if (reg) return reg;

  // 2. Strip trailing digits (iRacing username collision suffix)
  const stripped = stripTrailingDigits(name);
  if (stripped !== name && stripped.length > 0) {
    reg = await prisma.registration.findFirst({
      where: {
        seasonId,
        status: "APPROVED",
        user: { name: { equals: stripped, mode: "insensitive" } },
      },
    });
    if (reg) return reg;
  }

  return null;
}

function statusFromIRacingOut(outReason: string): FinishStatus {
  if (!outReason || outReason.toLowerCase() === "running") return "CLASSIFIED";
  const lc = outReason.toLowerCase();
  if (lc.includes("disq") || lc.includes("dsq")) return "DSQ";
  if (lc.includes("dns") || lc.includes("did not start")) return "DNS";
  return "DNF";
}

function statusFromLeagueManager(status: string): FinishStatus {
  if (!status) return "CLASSIFIED";
  const lc = status.toLowerCase();
  if (lc.includes("disq")) return "DSQ";
  if (lc.includes("dns") || lc.includes("did not start")) return "DNS";
  if (lc.includes("running")) return "CLASSIFIED";
  return "DNF";
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
  const detection = detectFormat(rawText);
  const csvText = rawText
    .split(/\r?\n/)
    .slice(detection.headerIdx)
    .join("\n");

  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
    delimiter: detection.delimiter,
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=Could+not+read+CSV+headers`
    );
  }

  const fields = parsed.meta.fields;

  const colPos = findHeader(fields, [
    "finpos",
    "pos",
    "position",
    "finishposition",
    "finishpos",
    "finishingposition",
  ]);
  const colName = findHeader(fields, ["name", "drivername", "driver"]);
  const colCustID = findHeader(fields, [
    "custid",
    "customerid",
    "memberid",
    "iracingmemberid",
    "irid",
  ]);
  const colLaps = findHeader(fields, [
    "lapscompl",
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
    "fastestlap",
    "bestlaptime",
    "besttime",
    "bestlap",
  ]);
  const colOut = findHeader(fields, [
    "out",
    "reasonout",
    "dnfreason",
    "outcome",
  ]);
  const colStatus = findHeader(fields, ["status"]);
  const colIRating = findHeader(fields, ["irating", "ir"]);
  const colPenaltyPts = findHeader(fields, [
    "penaltypoints",
    "penalty",
  ]);

  if (!colPos) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=CSV+missing+Position+column`
    );
  }

  // Compute max laps for raceDistancePct
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
    let reg: Registration | null = null;

    // --- Match the driver to a registration ---
    if (detection.format === "iracing" && colCustID) {
      const custId = String(row[colCustID] ?? "").trim().replace(/[^0-9]/g, "");
      if (!custId) {
        skipped++;
        errors.push({ row: i + 2, reason: "Cust ID empty" });
        continue;
      }
      reg = await prisma.registration.findFirst({
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
    } else {
      // iRLeagueManager — match by name
      const name = String(row[colName ?? ""] ?? "").trim();
      if (!name) {
        skipped++;
        errors.push({ row: i + 2, reason: "Name empty" });
        continue;
      }
      reg = await findRegistrationByName(seasonId, name);
      if (!reg) {
        skipped++;
        errors.push({
          row: i + 2,
          reason: `No approved registration matching name "${name}"`,
        });
        continue;
      }
    }

    // --- Build the result fields ---
    const finishPosition = parseInt(row[colPos] ?? "0", 10) || 0;
    const lapsCompleted = colLaps
      ? parseInt(row[colLaps] ?? "0", 10) || 0
      : 0;
    const raceDistancePct =
      maxLaps > 0 ? Math.round((lapsCompleted / maxLaps) * 100) : 0;
    const totalTimeMs = colTotalTime
      ? parseTimeToMs(row[colTotalTime])
      : null;
    const bestLapTimeMs = colBestTime
      ? parseTimeToMs(row[colBestTime])
      : null;
    const incidents = colInc
      ? parseInt(row[colInc] ?? "0", 10) || 0
      : 0;

    let finishStatus: FinishStatus;
    if (detection.format === "iracing" && colOut) {
      finishStatus = statusFromIRacingOut(String(row[colOut] ?? ""));
    } else if (colStatus) {
      finishStatus = statusFromLeagueManager(String(row[colStatus] ?? ""));
    } else {
      finishStatus = "CLASSIFIED";
    }

    let iRating: number | null = null;
    if (colIRating) {
      const v = parseInt(row[colIRating] ?? "", 10);
      if (!Number.isNaN(v)) iRating = v;
    }

    const manualPenaltyPoints = colPenaltyPts
      ? parseInt(row[colPenaltyPts] ?? "0", 10) || 0
      : 0;

    await prisma.raceResult.upsert({
      where: {
        roundId_registrationId_raceNumber: { roundId, registrationId: reg.id , raceNumber: 1 },
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
        manualPenaltyPoints,
        iRating,
      },
      update: {
        finishStatus,
        finishPosition,
        lapsCompleted,
        raceDistancePct,
        totalTimeMs,
        bestLapTimeMs,
        incidents,
        manualPenaltyPoints,
        iRating,
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
