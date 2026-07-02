"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function forgivePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string,
  formData: FormData
) {
  await requireAdmin();
  const raw = String(formData.get("forgivenPoints") ?? "").trim();
  const forgivenPoints = raw === "" ? 0 : Math.max(0, parseInt(raw, 10) || 0);
  const reason = String(formData.get("forgivenReason") ?? "").trim() || null;

  await prisma.penalty.update({
    where: { id: penaltyId },
    data: {
      forgivenPoints,
      forgivenAt: forgivenPoints > 0 ? new Date() : null,
      forgivenReason: forgivenPoints > 0 ? reason : null,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function releasePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string
) {
  await requireAdmin();
  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { releasedAt: new Date() },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function unreleasePenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string
) {
  await requireAdmin();
  await prisma.penalty.update({
    where: { id: penaltyId },
    data: { releasedAt: null },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

export async function releaseAllPending(leagueSlug: string, seasonId: string) {
  await requireAdmin();
  await prisma.penalty.updateMany({
    where: {
      type: "POINTS_DEDUCTION",
      releasedAt: null,
      round: { seasonId },
    },
    data: { releasedAt: new Date() },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

/**
 * Per-driver release: marks every NOT-yet-released POINTS_DEDUCTION penalty
 * for one registration as released. Called by the "Release pool" button on
 * each row of the new penalty pool table.
 */
export async function releasePoolForRegistration(
  leagueSlug: string,
  seasonId: string,
  registrationId: string,
  _formData?: FormData
) {
  const { requireSteward } = await import("@/lib/auth-helpers");
  const { prisma } = await import("@/lib/prisma");
  const { revalidatePath } = await import("next/cache");

  await requireSteward();
  await prisma.penalty.updateMany({
    where: {
      registrationId,
      type: "POINTS_DEDUCTION",
      releasedAt: null,
    },
    data: { releasedAt: new Date() },
  });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
}

/**
 * Manual pool penalty (no incident report needed) — e.g. wrong/missing
 * league livery. Creates a real Penalty row (source ADMIN_MANUAL,
 * type POINTS_DEDUCTION), so on deferred-pool seasons (GT3 WCT) it lands
 * in the penalty pool, participates in auto-forgiveness and is released
 * at season end like any steward penalty. On immediate systems it hits
 * the standings right away.
 */
export async function addManualPenalty(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  const { requireSteward } = await import("@/lib/auth-helpers");
  const { recomputePenaltyPoolForSeason } = await import("@/lib/penalty-pool");
  await requireSteward();

  const registrationId = String(formData.get("registrationId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const pointsRaw = String(formData.get("pointsValue") ?? "1");
  const pointsValue = Math.max(1, parseInt(pointsRaw, 10) || 1);
  const reason =
    String(formData.get("reason") ?? "").trim() || "Manual admin penalty";

  if (!registrationId || !roundId) return;

  // Guard: both must belong to this season.
  const [registration, round] = await Promise.all([
    prisma.registration.findUnique({
      where: { id: registrationId },
      select: { seasonId: true },
    }),
    prisma.round.findUnique({
      where: { id: roundId },
      select: { seasonId: true },
    }),
  ]);
  if (registration?.seasonId !== seasonId || round?.seasonId !== seasonId) {
    return;
  }

  await prisma.penalty.create({
    data: {
      registrationId,
      roundId,
      source: "ADMIN_MANUAL",
      type: "POINTS_DEDUCTION",
      pointsValue,
      reason,
    },
  });

  // No-op for non-GT3-WCT seasons (engine is hard-gated internally).
  await recomputePenaltyPoolForSeason(seasonId);

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}

/**
 * Delete a manual penalty (mistake correction). Only rows created via
 * addManualPenalty (source ADMIN_MANUAL) can be deleted here — incident
 * penalties must be handled through their report/decision.
 */
export async function deleteManualPenalty(
  leagueSlug: string,
  seasonId: string,
  penaltyId: string
) {
  const { requireSteward } = await import("@/lib/auth-helpers");
  const { recomputePenaltyPoolForSeason } = await import("@/lib/penalty-pool");
  await requireSteward();

  await prisma.penalty.deleteMany({
    where: { id: penaltyId, source: "ADMIN_MANUAL" },
  });

  await recomputePenaltyPoolForSeason(seasonId);

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
}
