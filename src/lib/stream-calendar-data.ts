/**
 * Loads the stream calendar from the DB (rounds of the streamed leagues +
 * the streamer choices stored as AppSettings). Shared by the admin page, the
 * public read-only page and the iframe embed.
 */
import { prisma } from "@/lib/prisma";
import { liveSeasonWhere } from "@/lib/season-visibility";
import {
  STREAM_KEY_PREFIX,
  STREAM_LEAGUES,
  buildStreamCalendar,
  type StreamCalendar,
} from "@/lib/stream-calendar";

export async function loadStreamCalendar(): Promise<StreamCalendar> {
  const [rows, settings] = await Promise.all([
    prisma.round.findMany({
      where: {
        season: {
          ...liveSeasonWhere,
          status: { not: "COMPLETED" },
          league: {
            ...liveSeasonWhere.league,
            slug: { in: STREAM_LEAGUES.map((l) => l.slug) },
          },
        },
      },
      select: {
        id: true,
        seasonId: true,
        roundNumber: true,
        name: true,
        track: true,
        startsAt: true,
        season: { select: { league: { select: { slug: true } } } },
      },
    }),
    prisma.appSetting.findMany({
      where: { key: { startsWith: STREAM_KEY_PREFIX } },
      select: { key: true, value: true },
    }),
  ]);

  return buildStreamCalendar(
    rows.map((r) => ({
      id: r.id,
      seasonId: r.seasonId,
      leagueSlug: r.season.league.slug,
      roundNumber: r.roundNumber,
      name: r.name,
      track: r.track,
      startsAt: r.startsAt,
    })),
    new Map(settings.map((s) => [s.key, s.value]))
  );
}
