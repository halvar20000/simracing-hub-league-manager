/**
 * When a stream announcement goes to Discord (Thomas, 2026-11-16): right
 * after the PREVIOUS CAS stream has ended — whatever league, whoever streamed.
 *
 *   previous stream = the latest round of a streamed league (STREAM_LEAGUES,
 *   live seasons) that starts before this round.
 *   due when  now >= previous start + MIN_RUN_MS  and no streamer channel
 *             (STREAMER_CHANNELS) is live on Twitch,
 *   or        now >= previous start + its MAX_RUN (Twitch unreachable / a
 *             streamer stays live with something else),
 *   or        now >= the announcement's own "Post at" (scheduledAt) - the
 *             latest moment, as before.
 *   No previous round, or one that had already started when the announcement
 *   was saved = only scheduledAt (so turning this on never fires a burst of
 *   older announcements, and a late upload keeps its own time).
 *
 * Round.startsAt is the naive Berlin wall clock (see match-stream.ts).
 */
import { prisma } from "@/lib/prisma";
import { liveSeasonWhere } from "@/lib/season-visibility";
import { reinterpretLocalAsZone, LEAGUE_TIME_ZONE } from "@/lib/match-stream";
import { STREAM_LEAGUES, STREAMER_CHANNELS } from "@/lib/stream-calendar";
import { liveChannels } from "@/lib/twitch";

const MIN = 60_000;
export const MIN_RUN_MS = 45 * MIN;
const MAX_RUN_MS = 4 * 60 * MIN;
const MAX_RUN_LONG_MS: Record<string, number> = { "cas-iec": 7 * 60 * MIN };

export type PreviousStream = {
  roundId: string;
  leagueSlug: string;
  leagueName: string;
  roundNumber: number;
  track: string;
  start: Date; // true instant
  latest: Date; // start + max run
};

const instant = (d: Date) => reinterpretLocalAsZone(d, LEAGUE_TIME_ZONE);

/** The last streamed race before `startsAt` (naive local), or null. */
export async function previousStream(
  startsAt: Date,
  excludeRoundId?: string
): Promise<PreviousStream | null> {
  const r = await prisma.round.findMany({
    where: {
      startsAt: { lt: startsAt, gte: new Date(startsAt.getTime() - 60 * 24 * 3600 * 1000) },
      ...(excludeRoundId ? { id: { not: excludeRoundId } } : {}),
      season: {
        ...liveSeasonWhere,
        league: { ...liveSeasonWhere.league, slug: { in: STREAM_LEAGUES.map((l) => l.slug) } },
      },
    },
    orderBy: { startsAt: "desc" },
    take: 1,
    select: {
      id: true,
      roundNumber: true,
      track: true,
      startsAt: true,
      season: { select: { league: { select: { slug: true, name: true } } } },
    },
  });
  if (!r.length) return null;
  const p = r[0];
  const start = instant(p.startsAt);
  const slug = p.season.league.slug;
  return {
    roundId: p.id,
    leagueSlug: slug,
    leagueName: p.season.league.name,
    roundNumber: p.roundNumber,
    track: p.track,
    start,
    latest: new Date(start.getTime() + (MAX_RUN_LONG_MS[slug] ?? MAX_RUN_MS)),
  };
}

export type PostDecision = { due: boolean; why: string };

/**
 * Should this announcement go out now? `liveNow` = the streamer channels live
 * at the moment (null = Twitch not reachable); asked lazily, once per cron run.
 */
export async function postDecision(
  a: { scheduledAt: Date; createdAt: Date; round: { id: string; startsAt: Date } },
  liveNow: () => Promise<string[] | null>,
  now: Date = new Date()
): Promise<PostDecision> {
  if (now >= a.scheduledAt) return { due: true, why: "post-at time reached" };
  const prev = await previousStream(a.round.startsAt, a.round.id);
  if (!prev || prev.start <= a.createdAt)
    return { due: false, why: "waiting for post-at (no previous stream after saving)" };
  if (now.getTime() < prev.start.getTime() + MIN_RUN_MS)
    return { due: false, why: `previous stream ${prev.leagueSlug} R${prev.roundNumber} not over yet` };
  if (now >= prev.latest) return { due: true, why: "previous stream over (time limit)" };
  const live = await liveNow();
  if (live === null) return { due: false, why: "Twitch not reachable - waiting for the time limit" };
  if (live.length) return { due: false, why: `still live: ${live.join(", ")}` };
  return { due: true, why: `previous stream ${prev.leagueSlug} R${prev.roundNumber} ended` };
}

/** Lazy, cached "who is live" for one cron run. */
export function liveChecker(): () => Promise<string[] | null> {
  let cached: Promise<string[] | null> | null = null;
  return () => {
    cached ??= liveChannels([...new Set(Object.values(STREAMER_CHANNELS))]).then((r) =>
      r.ok ? r.data : null
    );
    return cached;
  };
}
