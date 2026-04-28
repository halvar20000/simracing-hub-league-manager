"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  fetchEventResults,
  fetchLeagueMembers,
  type IRLMResultRow,
} from "@/lib/irlm";
import { recomputeRoundScoring } from "@/lib/scoring";
import type { FinishStatus } from "@prisma/client";

function statusFromIRLM(status: string | undefined): FinishStatus {
  if (!status) return "CLASSIFIED";
  const lc = status.toLowerCase();
  if (lc.includes("running")) return "CLASSIFIED";
  if (lc.includes("disq")) return "DSQ";
  if (lc.includes("disconnect")) return "DNF";
  return "DNF";
}

function durationToMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = d.trim();
  if (!t || t === "00:00:00" || t === "0") return null;
  const parts = t.split(":");
  let h = 0;
  let m = 0;
  let s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    s = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10);
    s = parseFloat(parts[1]);
  } else {
    s = parseFloat(t);
  }
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  const total = h * 3600 + m * 60 + s;
  if (total <= 0) return null;
  return Math.round(total * 1000);
}

function isRaceSession(sessionTypeOrName: string | undefined): boolean {
  if (!sessionTypeOrName) return true;
  const lc = sessionTypeOrName.toLowerCase();
  if (lc.includes("qualif") || lc.includes("practice") || lc.includes("warmup")) {
    return false;
  }
  return true;
}

async function importRow(
  seasonId: string,
  roundId: string,
  row: IRLMResultRow,
  maxLaps: number,
  memberMap: Map<number, string>
): Promise<{ ok: boolean; reason?: string }> {
  const irlmInternalId = Number(row.memberId);
  if (!irlmInternalId || Number.isNaN(irlmInternalId)) {
    return { ok: false, reason: "no memberId on row" };
  }
  const iracingCustId = memberMap.get(irlmInternalId);
  if (!iracingCustId) {
    return {
      ok: false,
      reason: `iRLM memberId ${irlmInternalId} not in /Members lookup`,
    };
  }

  const reg = await prisma.registration.findFirst({
    where: {
      seasonId,
      status: "APPROVED",
      user: { iracingMemberId: iracingCustId },
    },
  });
  if (!reg) {
    return {
      ok: false,
      reason: `no approved registration for iRacingId ${iracingCustId}`,
    };
  }

  const finishStatus = statusFromIRLM(row.status);
  const finishPosition = Math.round(Number(row.finishPosition ?? 0));
  const lapsCompleted = Math.round(Number(row.completedLaps ?? 0));
  let raceDistancePct = 0;
  if (maxLaps > 0) {
    raceDistancePct = Math.round((lapsCompleted / maxLaps) * 100);
  } else if (typeof row.completedPct === "number") {
    raceDistancePct = Math.round(row.completedPct * 100);
  }
  const incidents = Math.round(Number(row.incidents ?? 0));
  const bestLapTimeMs = durationToMs(row.fastestLapTime);
  const iRating = typeof row.newIrating === "number" ? row.newIrating : null;
  const qualifyingTimeMs = durationToMs(row.qualifyingTime);
  const startPositionRaw = Number(row.startPosition ?? 0);
  const startPosition =
    Number.isFinite(startPositionRaw) && startPositionRaw > 0
      ? Math.round(startPositionRaw)
      : null;

  await prisma.raceResult.upsert({
    where: { roundId_registrationId: { roundId, registrationId: reg.id } },
    create: {
      roundId,
      registrationId: reg.id,
      finishStatus,
      finishPosition,
      lapsCompleted,
      raceDistancePct,
      bestLapTimeMs,
      totalTimeMs: null,
      incidents,
      iRating,
      qualifyingTimeMs,
      startPosition,
    },
    update: {
      finishStatus,
      finishPosition,
      lapsCompleted,
      raceDistancePct,
      bestLapTimeMs,
      incidents,
      iRating,
      qualifyingTimeMs,
      startPosition,
    },
  });
  return { ok: true };
}

export async function pullResultsFromIRLM(formData: FormData): Promise<void> {
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  console.log("[IRLM] action invoked", { leagueSlug, seasonId, roundId });
  if (!leagueSlug || !seasonId || !roundId) return;

  const admin = await requireAdmin();

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: true },
  });
  if (!round) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  }

  if (!round.irlmEventId || !round.season.irlmLeagueName) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=Configure+iRLM+league+name+on+the+season+and+event+ID+on+the+round+first`
    );
  }

  let eventResults;
  let memberMap: Map<number, string>;
  try {
    const [results, members] = await Promise.all([
      fetchEventResults(round.season.irlmLeagueName, round.irlmEventId),
      fetchLeagueMembers(round.season.irlmLeagueName),
    ]);
    eventResults = results;
    memberMap = new Map<number, string>();
    for (const m of members) {
      const id = Number(m.memberId);
      const cust = String(m.iRacingId ?? "").trim();
      if (id && cust) memberMap.set(id, cust);
    }
    console.log(
      `[IRLM] fetched ${eventResults.length} eventResults, ${members.length} members`
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "iRLM fetch failed";
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=${encodeURIComponent(msg)}`
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors: { memberId: string; reason: string }[] = [];

  // iRLM returns multiple EventResults (Combined, Pro, Am, Team).
  // We use only the first one — the COMBINED scoring — which has true
  // overall positions 1..N. Per-class views filter+renumber on render.
  const combinedEventResult = eventResults[0];
  for (const eventResult of combinedEventResult ? [combinedEventResult] : []) {
    for (const session of eventResult.sessionResults ?? []) {
      if (!isRaceSession(session.sessionType ?? session.sessionName)) {
        continue;
      }
      const rows = session.resultRows ?? [];
      let maxLaps = 0;
      for (const row of rows) {
        const l = Number(row.completedLaps ?? 0);
        if (l > maxLaps) maxLaps = l;
      }
      for (const row of rows) {
        const result = await importRow(
          seasonId,
          roundId,
          row,
          maxLaps,
          memberMap
        );
        if (result.ok) {
          imported++;
        } else {
          skipped++;
          if (result.reason) {
            errors.push({
              memberId: String(row.memberId ?? "?"),
              reason: result.reason,
            });
          }
        }
      }
    }
  }

  await prisma.csvImport.create({
    data: {
      roundId,
      uploadedById: admin.id,
      originalFilename: `iRLM-pull-${new Date().toISOString()}`,
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
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);

  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?imported=${imported}&skipped=${skipped}`
  );
}
