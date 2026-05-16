/**
 * Post a per-round Twitch stream announcement to Discord. Idempotent via
 * StreamAnnouncement.postedAt + discordMessageId. Mirrors notify-rsvp.ts.
 */

import { prisma } from "@/lib/prisma";
import { postBotMessage } from "@/lib/discord-bot";
import { buildStreamEmbed } from "@/lib/discord-stream-embed";
import { resolveLogoUrl } from "@/lib/discord-rsvp-embed";

export type PostStreamResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "no-announcement"
        | "already-posted"
        | "no-channel"
        | "no-poster"
        | "too-early";
    }
  | {
      ok: false;
      reason: "post-failed";
      discordStatus: number;
      discordBody: string;
    };

export async function postStreamAnnouncement(
  roundId: string,
  opts?: { force?: boolean }
): Promise<PostStreamResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      streamAnnouncement: true,
    },
  });
  if (!round || !round.streamAnnouncement) {
    return { ok: false, reason: "no-announcement" };
  }
  const a = round.streamAnnouncement;
  if (a.postedAt && !opts?.force) {
    return { ok: false, reason: "already-posted" };
  }

  const channelId = round.season.league.discordStreamChannelId;
  if (!channelId) return { ok: false, reason: "no-channel" };

  if (!opts?.force && new Date() < a.scheduledAt) {
    return { ok: false, reason: "too-early" };
  }
  if (!a.posterBlobUrl) return { ok: false, reason: "no-poster" };

  const twitchUrl = a.twitchUrl ?? round.season.league.twitchUrl ?? null;

  const payload = buildStreamEmbed({
    leagueName: round.season.league.name,
    leagueLogoUrl: resolveLogoUrl(round.season.league.logoUrl),
    seasonLabel: `${round.season.year} ${round.season.name}`,
    roundNumber: round.roundNumber,
    roundName: round.name,
    track: round.track,
    trackConfig: round.trackConfig,
    startsAt: round.startsAt,
    scheduledStreamAt: a.scheduledAt,
    twitchUrl,
    posterImageUrl: a.posterBlobUrl,
    messageText: a.messageText,
    embedColor: round.season.league.discordEmbedColor,
  });

  const posted = await postBotMessage(channelId, payload);
  if (!posted.ok) {
    return {
      ok: false,
      reason: "post-failed",
      discordStatus: posted.status,
      discordBody: posted.body,
    };
  }

  await prisma.streamAnnouncement.update({
    where: { id: a.id },
    data: {
      postedAt: new Date(),
      discordChannelId: channelId,
      discordMessageId: posted.data.id,
    },
  });

  return { ok: true, messageId: posted.data.id };
}
