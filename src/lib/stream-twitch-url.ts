/**
 * The Twitch link of a round's stream announcement:
 *   1. the announcement's own twitchUrl (typed in by hand),
 *   2. the channel of whoever streams the round in the stream calendar
 *      (/admin/stream-calendar; Thomas / Andreas - STREAMER_CHANNELS),
 *   3. the league's twitchUrl (fallback, e.g. a race still "Open").
 */
import { prisma } from "@/lib/prisma";
import {
  streamerOfRound,
  streamerTwitchUrl,
  streamKeysOfRound,
} from "@/lib/stream-calendar";

type RoundForUrl = {
  id: string;
  seasonId: string;
  roundNumber: number;
  name: string | null;
  startsAt: Date;
  season: { league: { slug: string; twitchUrl: string | null } };
};

/** Whoever streams this round per the stream calendar (or null). */
export async function calendarStreamerOf(round: RoundForUrl): Promise<string | null> {
  const leagueSlug = round.season.league.slug;
  try {
    const keys = streamKeysOfRound({ id: round.id, leagueSlug, startsAt: round.startsAt });
    const rows = await prisma.appSetting.findMany({ where: { key: { in: keys } } });
    return streamerOfRound(
      {
        id: round.id,
        seasonId: round.seasonId,
        leagueSlug,
        roundNumber: round.roundNumber,
        name: round.name ?? "",
        track: "",
        startsAt: round.startsAt,
      },
      new Map(rows.map((r) => [r.key, r.value]))
    );
  } catch {
    return null;
  }
}

export async function resolveStreamTwitchUrl(
  round: RoundForUrl,
  own: string | null | undefined
): Promise<string | null> {
  if (own) return own;
  return streamerTwitchUrl(await calendarStreamerOf(round)) ?? round.season.league.twitchUrl ?? null;
}
