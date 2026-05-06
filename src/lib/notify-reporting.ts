import { prisma } from "@/lib/prisma";
import { postDiscordWebhook } from "@/lib/discord-webhook";

export type NotifyResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "already-notified"
        | "no-webhook"
        | "no-cooldown"
        | "too-early"
        | "webhook-failed";
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
  if (!lg.discordRegistrationsWebhookUrl) {
    return { ok: false, reason: "no-webhook" };
  }

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

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const reportUrl = `${baseUrl}/leagues/${lg.slug}/seasons/${round.seasonId}/rounds/${round.id}/report`;

  let deadlineText = "";
  if (windowHrs != null) {
    const closeAt = new Date(opensAt.getTime() + windowHrs * 3600 * 1000);
    deadlineText = `Reports close ${closeAt.toUTCString()}.`;
  }

  try {
    await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
      username: "CLS Reports",
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
  } catch {
    return { ok: false, reason: "webhook-failed" };
  }

  await prisma.round.update({
    where: { id: roundId },
    data: { reportingNotifiedAt: new Date() },
  });

  return { ok: true };
}
