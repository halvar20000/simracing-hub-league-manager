/**
 * RSVP reminder pings — 48h and 12h before a round.
 *
 * Strategy:
 *   - Find every active Registration in the round's season
 *   - Subtract anyone who already has a RoundRsvp row (any status)
 *   - Resolve each silent driver's Discord ID via Account (provider=discord)
 *   - Post a follow-up message that @-mentions only the silent drivers
 *
 * Idempotent via Round.rsvpReminder48hAt / rsvpReminder12hAt.
 * Bails silently if the RSVP message hasn't been posted yet (rsvpNotifiedAt = null).
 *
 * Discord has a 2000-char message limit and a hard cap of ~100 mentions per
 * message. We chunk mentions across multiple messages if needed.
 */

import { prisma } from "@/lib/prisma";
import { postBotMessage } from "@/lib/discord-bot";

export type ReminderKind = "48h" | "12h";

export type ReminderResult =
  | { ok: true; mentioned: number; messages: number }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "no-channel"
        | "not-posted-yet"
        | "already-sent"
        | "round-not-upcoming"
        | "out-of-window"
        | "no-silent-drivers";
    };

const MAX_MENTIONS_PER_MESSAGE = 60;

export async function sendReminderForRound(
  roundId: string,
  kind: ReminderKind,
  opts?: { force?: boolean }
): Promise<ReminderResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: true,
          registrations: {
            where: { excludedAt: null },
            include: {
              user: {
                include: {
                  accounts: {
                    where: { provider: "discord" },
                    select: { providerAccountId: true },
                  },
                },
              },
            },
          },
        },
      },
      rsvps: { select: { registrationId: true } },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const channelId = round.season.league.discordRsvpChannelId;
  if (!channelId) return { ok: false, reason: "no-channel" };
  if (round.status !== "UPCOMING") return { ok: false, reason: "round-not-upcoming" };
  if (!round.rsvpNotifiedAt) return { ok: false, reason: "not-posted-yet" };

  const alreadyField = kind === "48h" ? "rsvpReminder48hAt" : "rsvpReminder12hAt";
  if (round[alreadyField] && !opts?.force) {
    return { ok: false, reason: "already-sent" };
  }

  // Window check: only fire when within the configured window of the race.
  const now = new Date();
  const raceTs = round.startsAt.getTime();
  const hoursToRace = (raceTs - now.getTime()) / (3600 * 1000);
  if (!opts?.force) {
    if (kind === "48h") {
      // Fire when between 48h and 24h before the race
      if (hoursToRace > 48 || hoursToRace < 24) {
        return { ok: false, reason: "out-of-window" };
      }
    } else {
      // 12h reminder: fire when between 12h and 2h before the race
      if (hoursToRace > 12 || hoursToRace < 2) {
        return { ok: false, reason: "out-of-window" };
      }
    }
  }

  const rsvpRegIds = new Set(round.rsvps.map((r) => r.registrationId));
  const silent = round.season.registrations.filter((reg) => !rsvpRegIds.has(reg.id));
  if (silent.length === 0) {
    // Mark as sent so we don't keep checking.
    await prisma.round.update({
      where: { id: roundId },
      data: { [alreadyField]: new Date() },
    });
    return { ok: false, reason: "no-silent-drivers" };
  }

  // Build mention list: only drivers with a linked Discord account.
  const discordIds: string[] = [];
  for (const reg of silent) {
    const acc = reg.user.accounts[0];
    if (acc?.providerAccountId) discordIds.push(acc.providerAccountId);
  }
  if (discordIds.length === 0) {
    await prisma.round.update({
      where: { id: roundId },
      data: { [alreadyField]: new Date() },
    });
    return { ok: false, reason: "no-silent-drivers" };
  }

  const ts = Math.floor(round.startsAt.getTime() / 1000);
  const header =
    kind === "48h"
      ? `⏰ **RSVP reminder — Round ${round.roundNumber} (${round.name})** starts <t:${ts}:R>.\n` +
        `Please confirm your participation — drivers who don't respond AND don't show up may incur a penalty point in GT3 WCT.`
      : `🚨 **Final RSVP reminder — Round ${round.roundNumber} (${round.name})** starts <t:${ts}:R>.\n` +
        `Last chance to RSVP — silent drivers who no-show will get a penalty point (GT3 WCT).`;

  // Chunk mentions across messages to respect Discord limits.
  let messages = 0;
  for (let i = 0; i < discordIds.length; i += MAX_MENTIONS_PER_MESSAGE) {
    const chunk = discordIds.slice(i, i + MAX_MENTIONS_PER_MESSAGE);
    const mentions = chunk.map((id) => `<@${id}>`).join(" ");
    const content = i === 0 ? `${header}\n\n${mentions}` : mentions;
    const res = await postBotMessage(channelId, {
      content,
      allowed_mentions: { users: chunk },
    });
    if (res.ok) messages++;
  }

  await prisma.round.update({
    where: { id: roundId },
    data: { [alreadyField]: new Date() },
  });

  return { ok: true, mentioned: discordIds.length, messages };
}
