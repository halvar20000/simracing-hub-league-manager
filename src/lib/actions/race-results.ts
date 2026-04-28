"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import { parseTimeToMs } from "@/lib/time";
import type { FinishStatus } from "@prisma/client";

export async function upsertRaceResult(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  registrationId: string,
  formData: FormData
) {
  await requireAdmin();

  const finishStatus = String(
    formData.get("finishStatus") ?? "CLASSIFIED"
  ) as FinishStatus;
  const finishPositionRaw = String(
    formData.get("finishPosition") ?? ""
  ).trim();
  const finishPosition = finishPositionRaw
    ? parseInt(finishPositionRaw, 10)
    : 0;
  const lapsCompletedRaw = String(formData.get("lapsCompleted") ?? "0");
  const lapsCompleted = parseInt(lapsCompletedRaw, 10) || 0;
  const raceDistancePctRaw = String(formData.get("raceDistancePct") ?? "100");
  const raceDistancePct = Math.max(
    0,
    Math.min(100, parseInt(raceDistancePctRaw, 10) || 0)
  );
  const totalTimeMs = parseTimeToMs(
    String(formData.get("totalTime") ?? "")
  );
  const bestLapTimeMs = parseTimeToMs(
    String(formData.get("bestLapTime") ?? "")
  );
  const startPositionRaw = String(formData.get("startPosition") ?? "").trim();
  const startPosition = startPositionRaw
    ? parseInt(startPositionRaw, 10) || null
    : null;
  const qualifyingTimeMs = parseTimeToMs(
    String(formData.get("qualifyingTime") ?? "")
  );
  const incidentsRaw = String(formData.get("incidents") ?? "0");
  const incidents = parseInt(incidentsRaw, 10) || 0;
  const manualPenaltyPointsRaw = String(
    formData.get("manualPenaltyPoints") ?? "0"
  );
  const manualPenaltyPoints = parseInt(manualPenaltyPointsRaw, 10) || 0;
  const manualPenaltyReason =
    String(formData.get("manualPenaltyReason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const data = {
    finishStatus,
    finishPosition,
    lapsCompleted,
    raceDistancePct,
    totalTimeMs,
    bestLapTimeMs,
    startPosition,
    qualifyingTimeMs,
    incidents,
    manualPenaltyPoints,
    manualPenaltyReason,
    notes,
  };

  await prisma.raceResult.upsert({
    where: { roundId_registrationId_raceNumber: { roundId, registrationId, raceNumber: 1 } },
    create: { roundId, registrationId, ...data },
    update: data,
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteRaceResult(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  resultId: string
) {
  await requireAdmin();

  await prisma.raceResult.delete({ where: { id: resultId } });
  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
}
