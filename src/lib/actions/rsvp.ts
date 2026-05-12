"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { upsertRsvp, toggleDecline, refreshDiscordRsvpMessage } from "@/lib/rsvp";
import { postRsvpForRound } from "@/lib/notify-rsvp";
import { getChannelAsBot } from "@/lib/discord-bot";
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
 * Driver-side toggle action for DECLINE_ONLY leagues. The widget renders a
 * single Decline button; this action flips between "declined" and "no row".
 */
export async function toggleDeclineAction(formData: FormData): Promise<void> {
  const user = await requireAuth();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");

  await toggleDecline({
    roundId,
    userId: user.id!,
    source: "WEBSITE",
  });

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
 * Redirects back to the RSVP page with status info in the URL so the page
 * can show a banner instead of leaving the admin guessing.
 */
export async function postRsvpManually(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");

  const result = await postRsvpForRound(roundId, { force: true });

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round) return;
  const base = `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}/rsvp`;

  revalidatePath(base);

  const params = new URLSearchParams();
  if (result.ok) {
    params.set("status", "posted");
    params.set("messageId", result.messageId);
  } else {
    params.set("status", "error");
    params.set("reason", result.reason);
    if (result.reason === "post-failed") {
      params.set("discordStatus", String(result.discordStatus));
      params.set("discordBody", result.discordBody.slice(0, 400));
    }
  }
  redirect(`${base}?${params.toString()}`);
}

/**
 * Admin diagnostic: ask Discord "can the bot see this channel?" using the
 * channel ID configured on the league. Surfaces exact error text from Discord.
 */
export async function checkDiscordAccessAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round) return;
  const league = round.season.league;
  const base = `/admin/leagues/${league.slug}/seasons/${round.seasonId}/rounds/${round.id}/rsvp`;

  const params = new URLSearchParams();
  params.set("diag", "1");

  if (!process.env.DISCORD_BOT_TOKEN) {
    params.set("diagStatus", "error");
    params.set("diagReason", "DISCORD_BOT_TOKEN env var is not set on Vercel.");
    redirect(`${base}?${params.toString()}`);
  }
  if (!league.discordRsvpChannelId) {
    params.set("diagStatus", "error");
    params.set("diagReason", "No RSVP channel ID configured on the league.");
    redirect(`${base}?${params.toString()}`);
  }

  const res = await getChannelAsBot(league.discordRsvpChannelId!);
  if (res.ok) {
    params.set("diagStatus", "ok");
    params.set("diagChannelName", res.data.name ?? "(unnamed)");
    params.set("diagGuildId", res.data.guild_id ?? "(unknown)");
  } else {
    params.set("diagStatus", "error");
    params.set("diagDiscordStatus", String(res.status));
    params.set("diagReason", res.body.slice(0, 400));
  }

  redirect(`${base}?${params.toString()}`);
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
