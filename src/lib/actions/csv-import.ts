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
