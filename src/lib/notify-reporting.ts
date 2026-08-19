/**
 * Post "incident reports are open" for a round to Discord. Idempotent via
 * Round.reportingNotifiedAt.
 *
 * Uses the Discord BOT (like every other notifier in this codebase). Until
 * 2026-08-07 it was the last one still posting through a webhook URL
 * (League.discordRegistrationsWebhookUrl) — and since no league ever had that
 * webhook configured, it had never fired once for any league. Don't move it
 * back to a webhook.
 */
import { prisma } from "@/lib/prisma";
import { postBotMessage } from "@/lib/discord-bot";

export type NotifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "already-notified"
        | "disabled"
        | "no-channel"
        | "no-cooldown"
        | "too-early"
        | "post-failed";
    };

export async function notifyReportingOpenForRound(
  roundId: string,
  opts?: { force?: boolean }
): Promise<NotifyResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true, scoringSystem: true } },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };
  if (round.reportingNotifiedAt) return { ok: false, reason: "already-notified" };

  const lg = round.season.league;

  const cooldownHrs = round.season.scoringSystem?.protestCooldownHours ?? null;
  const windowHrs = round.season.scoringSystem?.protestWindowHours ?? null;
  if (cooldownHrs == null) {
    return { ok: false, reason: "no-cooldown" };
  }

  const opensAt = new Date(
    round.startsAt.getTime() + cooldownHrs * 3600 * 1000
  );
  const now = new Date();
  if (!opts?.force && opensAt > now) {
    return { ok: false, reason: "too-early" };
  }

  // Per-league master switch (default OFF since 2026-08-19). Deliberately
  // checked AFTER the cooldown gate and BEFORE the channel lookup:
  //  - after too-early, so a future round is never stamped ahead of time;
  //  - before no-channel, so a league with no channel configured still gets
  //    its rounds stamped instead of piling up an invisible backlog.
  // The stamp is the whole point: it means switching a league back on later
  // announces only NEW rounds, never a wall of stale ones. `force` (the admin
  // "Announce reporting now" button) bypasses the switch entirely.
  if (!opts?.force && !lg.reportingOpenNotifyEnabled) {
    await prisma.round.update({
      where: { id: roundId },
      data: { reportingNotifiedAt: new Date() },
    });
    return { ok: false, reason: "disabled" };
  }

  // Dedicated reports channel if set, otherwise reuse the league's RSVP
  // channel — the drivers who need to see this are already in it.
  const channelId = lg.discordReportsChannelId ?? lg.discordRsvpChannelId;
  if (!channelId) {
    return { ok: false, reason: "no-channel" };
  }

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const reportUrl = `${baseUrl}/leagues/${lg.slug}/seasons/${round.seasonId}/rounds/${round.id}/report`;

  let deadlineText = "";
  if (windowHrs != null) {
    const closeAt = new Date(opensAt.getTime() + windowHrs * 3600 * 1000);
    deadlineText = `Reports close ${closeAt.toUTCString()}.`;
  }

  const posted = await postBotMessage(channelId, {
      embeds: [
        {
          title: `📋 Incident reports open — ${lg.name}`,
          description:
            `**${round.season.name} ${round.season.year}** · Round ${round.roundNumber}: **${round.name}**` +
            (round.track ? ` · ${round.track}` : "") +
            (deadlineText ? `\n\n${deadlineText}` : ""),
          url: reportUrl,
          color: 0xf59e0b,
          fields: [
            {
              name: "Submit a report",
              value: `[Open the report form](${reportUrl})`,
              inline: false,
            },
          ],
          timestamp: new Date().toISOString(),
          footer: { text: "CLS — Incident reports" },
        },
      ],
  });
  if (!posted.ok) {
    return { ok: false, reason: "post-failed" };
  }

  await prisma.round.update({
    where: { id: roundId },
    data: { reportingNotifiedAt: new Date() },
  });

  return { ok: true };
}
