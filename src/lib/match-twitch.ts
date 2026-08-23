/**
 * Auto-match a race-stream Twitch VOD to a round.
 *
 * For a round whose league has `twitchChannelLogin` set, we pull the channel's
 * videos and pick the one most likely to be that round's broadcast.
 *
 * WHY THIS RANKS DIFFERENTLY FROM THE YOUTUBE MATCHER: a Twitch "archive" VOD
 * is the recording of the live broadcast, so `published_at` IS the moment the
 * stream went live — for CAS SFL that lands 8-50 minutes after the scheduled
 * race start, every time. Titles, on the other hand, are unreliable: the SFL
 * stream titled "CAS SFL CUP Rennen drei" is actually round 4 (round 3 was
 * postponed), so trusting the title's round number would link the WRONG round.
 * We therefore match on date proximity inside a tight window and use the title
 * only as a tie-breaker when two streams fall in the same window.
 *
 * The result is stored on `Round.twitchVideoId` / `twitchVideoType`
 * (+ `twitchMatchedAt`) and embedded on the public round page. The cron only
 * fills rounds where `twitchVideoId` is null, so a manually pasted link is
 * never overwritten.
 *
 * Not a "use server" module — imported by the cron route and the admin
 * server action.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveUserId,
  listChannelVideos,
  twitchThumbUrl,
  type TwitchVideo,
} from "@/lib/twitch";
import {
  LEAGUE_TIME_ZONE,
  reinterpretLocalAsZone,
  trackMatches,
} from "@/lib/match-stream";

/**
 * How far the stream start may sit from the scheduled race start, in hours.
 * A broadcast may begin with a pre-show (before) or after a delayed grid
 * (after), so the window is asymmetric but tight. Measured CAS SFL deltas:
 * +8 min, +30 min, +49 min. Rounds are 2 weeks apart, so ±6h cannot collide
 * with a neighbouring round — while a "Testtag" stream 14 days out is safely
 * excluded.
 */
const WINDOW_BEFORE_HOURS = 3;
const WINDOW_AFTER_HOURS = 6;

/**
 * How far back the cron sweep looks for completed rounds still missing a VOD.
 * Note that Twitch deletes archives after 7-60 days, so reaching much further
 * back mostly finds nothing — but the sweep is cheap (one API call per
 * channel) and highlights/uploads do persist, so we keep a season-wide window.
 */
export const TWITCH_MATCH_LOOKBACK_DAYS = 120;

/** How many videos to pull per channel. Twitch pages 100 at a time. */
const VIDEO_FETCH_LIMIT = 100;

/**
 * Pick the best VOD for a round: nearest broadcast start inside the window.
 * A title that names the round's track wins over one that doesn't, which only
 * matters when a channel streamed twice in the same window (e.g. a practice
 * session followed by the race).
 */
export function pickBestVideo(
  videos: TwitchVideo[],
  raceInstant: Date,
  track: string
): TwitchVideo | null {
  const startMs = raceInstant.getTime();
  const HOUR = 3_600_000;

  let best: { v: TwitchVideo; tier: number; absMs: number } | null = null;
  for (const v of videos) {
    const pub = new Date(v.publishedAt).getTime();
    if (Number.isNaN(pub)) continue;
    const deltaMs = pub - startMs; // negative = stream started early
    if (deltaMs < -WINDOW_BEFORE_HOURS * HOUR) continue;
    if (deltaMs > WINDOW_AFTER_HOURS * HOUR) continue;

    const tier = trackMatches(v.title, track) ? 1 : 0;
    const absMs = Math.abs(deltaMs);
    if (!best || tier > best.tier || (tier === best.tier && absMs < best.absMs)) {
      best = { v, tier, absMs };
    }
  }
  return best?.v ?? null;
}

export type TwitchMatchResult =
  | { ok: true; action: "matched" | "unchanged"; videoId: string }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "not-configured" // league has no twitchChannelLogin
        | "already-set" // a VOD is already linked (non-force)
        | "no-key" // TWITCH_CLIENT_ID / _SECRET missing
        | "channel-not-found"
        | "no-candidate" // no broadcast in the time window
        | "api-error";
      detail?: string;
    };

/**
 * Match (and store) a Twitch VOD for one round.
 * Pass `force: true` to re-match even if a VOD is already linked.
 * Pass `videosCache` (login → videos) to reuse a fetch across rounds.
 */
export async function matchTwitchForRound(
  roundId: string,
  opts: {
    force?: boolean;
    videosCache?: Map<string, TwitchVideo[] | null>;
  } = {}
): Promise<TwitchMatchResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: { select: { twitchChannelLogin: true } },
        },
      },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const login = round.season.league.twitchChannelLogin;
  if (!login) return { ok: false, reason: "not-configured" };

  if (round.twitchVideoId && !opts.force)
    return { ok: false, reason: "already-set" };

  // Resolve + fetch the channel's videos (reuse the cached list when given).
  let videos: TwitchVideo[] | null | undefined = opts.videosCache?.get(login);
  if (videos === undefined) {
    const user = await resolveUserId(login);
    if (!user.ok) {
      const reason =
        user.reason === "no-key"
          ? "no-key"
          : user.reason === "not-found"
            ? "channel-not-found"
            : "api-error";
      // Don't cache a no-key/api failure as "no videos" — a later round in the
      // same sweep would then silently report no-candidate instead of the real
      // error. Only a successful empty list is worth caching.
      return { ok: false, reason, detail: user.detail };
    }
    const list = await listChannelVideos(user.data, VIDEO_FETCH_LIMIT);
    if (!list.ok) {
      const reason = list.reason === "no-key" ? "no-key" : "api-error";
      return { ok: false, reason, detail: list.detail };
    }
    videos = list.data;
    opts.videosCache?.set(login, videos);
  }
  if (videos == null) return { ok: false, reason: "api-error" };

  const raceInstant = reinterpretLocalAsZone(round.startsAt, LEAGUE_TIME_ZONE);
  const best = pickBestVideo(videos, raceInstant, round.track);
  if (!best) return { ok: false, reason: "no-candidate" };

  const thumb = twitchThumbUrl(best.thumbnailUrl);

  if (round.twitchVideoId === best.videoId) {
    // Refresh the kind (and a thumbnail Twitch generated late) even on a
    // no-op — a broadcaster can promote an archive to a permanent highlight,
    // which clears the expiry warning.
    if (
      round.twitchVideoType !== best.type ||
      (thumb && round.twitchThumbnailUrl !== thumb)
    ) {
      await prisma.round.update({
        where: { id: roundId },
        data: {
          twitchVideoType: best.type,
          ...(thumb ? { twitchThumbnailUrl: thumb } : {}),
        },
      });
    }
    return { ok: true, action: "unchanged", videoId: best.videoId };
  }

  await prisma.round.update({
    where: { id: roundId },
    data: {
      twitchVideoId: best.videoId,
      twitchVideoType: best.type,
      twitchThumbnailUrl: thumb,
      twitchMatchedAt: new Date(),
    },
  });
  return { ok: true, action: "matched", videoId: best.videoId };
}

export type TwitchSweepSummary = {
  matched: { id: string; videoId: string }[];
  noCandidate: string[];
  skipped: { id: string; reason: string }[];
};

/**
 * Cron entrypoint: fill in Twitch VODs for recently completed rounds that
 * don't have one yet, across every league with `twitchChannelLogin` set.
 * Fetches each channel's video list once.
 */
export async function matchTwitchForRecentRounds(
  lookbackDays: number = TWITCH_MATCH_LOOKBACK_DAYS
): Promise<TwitchSweepSummary> {
  const since = new Date(Date.now() - lookbackDays * 24 * 3600 * 1000);

  const rounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      twitchVideoId: null,
      startsAt: { gte: since },
      season: {
        isArchived: false,
        league: { twitchChannelLogin: { not: null } },
      },
    },
    select: { id: true },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  const summary: TwitchSweepSummary = {
    matched: [],
    noCandidate: [],
    skipped: [],
  };
  const videosCache = new Map<string, TwitchVideo[] | null>();

  for (const r of rounds) {
    const res = await matchTwitchForRound(r.id, { videosCache });
    if (res.ok) {
      if (res.action === "matched")
        summary.matched.push({ id: r.id, videoId: res.videoId });
    } else if (res.reason === "no-candidate") {
      summary.noCandidate.push(r.id);
    } else {
      summary.skipped.push({ id: r.id, reason: res.reason });
    }
  }

  return summary;
}
