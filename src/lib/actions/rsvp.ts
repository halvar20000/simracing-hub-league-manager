"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { upsertRsvp, refreshDiscordRsvpMessage } from "@/lib/rsvp";
import { postRsvpForRound } from "@/lib/notify-rsvp";
import type { RsvpStatus } from "@prisma/client";

/**
 * Driver-side: from the round detail page widget. The form must include
 * `roundId` and `status`.
 *
 * Used as `<form action={submitRsvpAction}>` — MUST return void.
 */
export async function submitRsvpAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const roundId = String(formData.get("roundId") ?? "");
  const status = String(formData.get("status") ?? "") as RsvpStatus;
  if (!roundId) throw new Error("roundId required");
  if (status !== "ACCEPTED" && status !== "DECLINED" && status !== "TENTATIVE") {
    throw new Error(`invalid status: ${status}`);
  }

  await upsertRsvp({
    roundId,
    userId: user.id!,
    status,
    source: "WEBSITE",
  });

  // Revalidate the public round page so the widget reflects the new state.
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (round) {
    revalidatePath(
      `/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}`
    );
    revalidatePath(
      `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}/rsvp`
    );
  }
}

/**
 * Admin: manually post the RSVP message now (ignores the "X days before" window).
 */
export async function postRsvpManually(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");
  await postRsvpForRound(roundId, { force: true });

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (round) {
    revalidatePath(
      `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}/rsvp`
    );
  }
}

/**
 * Admin: rebuild the Discord embed (re-fetches current tallies + driver names).
 */
export async function refreshRsvpMessageAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");
  await refreshDiscordRsvpMessage(roundId);

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (round) {
    revalidatePath(
      `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}/rsvp`
    );
  }
}
