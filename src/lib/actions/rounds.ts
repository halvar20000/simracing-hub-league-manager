"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { RoundStatus } from "@prisma/client";

export async function createRound(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;

  if (!name || !track || !startsAtRaw) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/new?error=Name%2C+track+and+start+time+are+required`
    );
  }

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  // Auto-assign next round number
  const lastRound = await prisma.round.findFirst({
    where: { seasonId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true },
  });
  const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

  await prisma.round.create({
    data: {
      seasonId,
      roundNumber,
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function updateRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;
  const status = String(formData.get("status") ?? "UPCOMING") as RoundStatus;
  const irlmEventIdRaw = String(formData.get("irlmEventId") ?? "").trim();
  const irlmEventId = irlmEventIdRaw ? parseInt(irlmEventIdRaw, 10) : null;

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  await prisma.round.update({
    where: { id: roundId },
    data: {
      irlmEventId,
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
      status,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string
) {
  await requireAdmin();
  await prisma.round.delete({ where: { id: roundId } });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}
