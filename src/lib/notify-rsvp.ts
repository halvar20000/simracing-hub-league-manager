/**
 * Post the per-round RSVP message to Discord.
 *
 * Idempotent via Round.rsvpNotifiedAt + RoundDiscordRsvpMessage row.
 * Same shape as notify-reporting.ts so the cron pattern is mechanical.
 */

import { prisma } from "@/lib/prisma";
import { postBotMessage } from "@/lib/discord-bot";
import { buildRsvpEmbed, type RsvpDriverSummary } from "@/lib/discord-rsvp-embed";
import { driverDisplayName } from "@/lib/rsvp";

export type PostRsvpResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "already-notified"
        | "no-channel"
        | "round-not-upcoming"
        | "too-early"
        | "post-failed";
    };

export async function postRsvpForRound(
  roundId: string,
  opts?: { force?: boolean }
): Promise<PostRsvpResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      rsvps: {
        include: {
          registration: {
            include: {
              user: { select: { name: true, firstName: true, lastName: true } },
            },
          },
        },
      },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };
  if (round.rsvpNotifiedAt && !opts?.force) {
    return { ok: false, reason: "already-notified" };
  }
  if (round.status !== "UPCOMING") {
    return { ok: false, reason: "round-not-upcoming" };
  }

  const channelId = round.season.league.discordRsvpChannelId;
  if (!channelId) return { ok: false, reason: "no-channel" };

  const daysBefore = round.season.league.rsvpDaysBefore;
  const opensAt = new Date(
    round.startsAt.getTime() - daysBefore * 24 * 3600 * 1000
  );
  if (!opts?.force && new Date() < opensAt) {
    return { ok: false, reason: "too-early" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const roundUrl = `${baseUrl}/leagues/${round.season.league.slug}/seasons/${round.seasonId}/rounds/${round.id}`;

  const drivers: RsvpDriverSummary[] = round.rsvps.map((r) => ({
    registrationId: r.registrationId,
    displayName: driverDisplayName(r.registration.user),
    status: r.status,
  }));

  const payload = buildRsvpEmbed(
    {
      leagueName: round.season.league.name,
      seasonLabel: `${round.season.year} ${round.season.name}`,
      roundNumber: round.roundNumber,
      roundName: round.name,
      track: round.track,
      trackConfig: round.trackConfig,
      startsAt: round.startsAt,
      roundUrl,
      drivers,
    },
    round.id
  );

  const posted = await postBotMessage(channelId, payload);
  if (!posted.ok) return { ok: false, reason: "post-failed" };

  // Persist message ID for future edits, mark round as notified.
  await prisma.$transaction([
    prisma.roundDiscordRsvpMessage.upsert({
      where: { roundId: round.id },
      create: {
        roundId: round.id,
        channelId,
        messageId: posted.data.id,
      },
      update: {
        channelId,
        messageId: posted.data.id,
        closedAt: null,
      },
    }),
    prisma.round.update({
      where: { id: round.id },
      data: { rsvpNotifiedAt: new Date() },
    }),
  ]);

  return { ok: true, messageId: posted.data.id };
}
