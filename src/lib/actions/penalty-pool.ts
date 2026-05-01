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
