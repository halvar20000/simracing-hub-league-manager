/**
 * Post a round's results to Discord after the race.
 *
 * postRoundResults(roundId) builds a podium embed with links back to the full
 * classification and the championship standings, and posts it to the league's
 * configured results channel. Idempotent — guarded by Round.resultsPostedAt.
 *
 * Triggered from updateRound when a round flips to COMPLETED. Does nothing
 * (and leaves resultsPostedAt null, so it retries on the next round save) when
 * the league has no results channel configured or the round has no results
 * imported yet.
 *
 * Not a "use server" module — imported by the rounds server action.
 */

import { prisma } from "@/lib/prisma";
import { postBotMessage, type Embed } from "@/lib/discord-bot";

export type PostResultsResult =
  | { ok: true; messageId: string }
  | {
      ok: false;
      reason:
        | "already-posted"
        | "not-configured"
        | "round-not-found"
        | "no-results"
        | "post-failed";
    };

/** League embed colour ("#RRGGBB") → int; defaults to the CLS orange. */
function hexToInt(hex: string | null | undefined): number {
  const m = /^#?([0-9a-fA-F]{6})$/.exec((hex ?? "").trim());
  return m ? parseInt(m[1], 16) : 0xff6b35;
}

function driverName(u: {
  firstName: string | null;
  lastName: string | null;
  name: string | null;
}): string {
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || "Unknown";
}

export async function postRoundResults(
  roundId: string
): Promise<PostResultsResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      raceResults: {
        include: { registration: { include: { user: true } } },
        orderBy: { finishPosition: "asc" },
      },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };
  if (round.resultsPostedAt) return { ok: false, reason: "already-posted" };

  const channelId = round.season.league.discordResultsChannelId;
  if (!channelId) return { ok: false, reason: "not-configured" };
  if (round.raceResults.length === 0) return { ok: false, reason: "no-results" };

  const podiumLabels = ["P1", "P2", "P3"];
  const podiumLines = round.raceResults
    .slice(0, 3)
    .map((r, i) => `\`${podiumLabels[i]}\`  ${driverName(r.registration.user)}`)
    .join("\n");

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const slug = round.season.league.slug;
  const roundUrl = `${baseUrl}/leagues/${slug}/seasons/${round.seasonId}/rounds/${round.id}`;
  const standingsUrl = `${baseUrl}/leagues/${slug}/seasons/${round.seasonId}/standings`;
  const trackLine =
    round.track + (round.trackConfig ? ` (${round.trackConfig})` : "");

  const embed: Embed = {
    title: `R${round.roundNumber}: ${round.name} — Results`,
    description:
      `${trackLine}\n\n` +
      `[Full classification](${roundUrl})  ·  ` +
      `[Championship standings](${standingsUrl})`,
    color: hexToInt(round.season.league.discordEmbedColor),
    fields: [{ name: "Podium", value: podiumLines || "—" }],
    footer: {
      text: `${round.season.league.name} — ${round.season.name} ${round.season.year}`,
    },
    timestamp: new Date().toISOString(),
  };

  const res = await postBotMessage(channelId, { embeds: [embed] });
  if (!res.ok) return { ok: false, reason: "post-failed" };

  await prisma.round.update({
    where: { id: roundId },
    data: { resultsPostedAt: new Date() },
  });
  return { ok: true, messageId: res.data.id };
}
