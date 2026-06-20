/**
 * Auto-match a race-stream YouTube VOD to a round.
 *
 * For a round whose league has `youtubeChannelId` set, we pull the channel's
 * recent uploads and pick the video most likely to be that round's stream:
 *   - it must have published within a window around the race start, and
 *   - among those, the one closest in time wins, with a bonus for titles that
 *     mention the round number or track (tie-breaker for same-day uploads).
 *
 * The result is stored on `Round.youtubeVideoId` (+ `youtubeMatchedAt`) and
 * embedded on the public round page. The cron only fills rounds where
 * `youtubeVideoId` is null, so a manually pasted link is never overwritten.
 *
 * Not a "use server" module — imported by the cron route and the admin
 * server action.
 */

import { prisma } from "@/lib/prisma";
import {
  resolveUploadsPlaylistId,
  listRecentUploads,
  type YoutubeUpload,
} from "@/lib/youtube";

/** CLS stores round start times as a naive wall-clock in German time. */
const LEAGUE_TIME_ZONE = "Europe/Berlin";

/**
 * Search window around the race start: a stream VOD's publish instant is
 * roughly when the broadcast went live (sometimes a pre-show before the
 * green flag, and the VOD lingers as it's processed afterwards).
 */
const WINDOW_BEFORE_H = 12;
const WINDOW_AFTER_H = 18;

/** How far back the cron sweep looks for completed rounds still missing a video. */
export const MATCH_LOOKBACK_DAYS = 45;

/** How DST-aware-many ms a timezone is ahead of UTC at a given instant. */
function zoneOffsetMs(at: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(at)) p[part.type] = part.value;
  const asUTC = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour),
    Number(p.minute),
    Number(p.second)
  );
  return asUTC - at.getTime();
}

/**
 * Reinterpret a Date's runtime-local wall-clock as a wall-clock in `timeZone`
 * and return the true UTC instant. No-op if the runtime already runs in
 * `timeZone`, so it's safe regardless of the server's TZ.
 */
function reinterpretLocalAsZone(d: Date, timeZone: string): Date {
  const asUTC = Date.UTC(
    d.getFullYear(),
    d.getMonth(),
    d.getDate(),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds()
  );
  const guess = new Date(asUTC);
  return new Date(asUTC - zoneOffsetMs(guess, timeZone));
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/**
 * Title-relevance bonus (in "hours" so it can offset the time-distance score).
 * Rewards titles that name the round number or the track — useful when a
 * channel posts several videos on race day.
 */
function titleBonusHours(
  title: string,
  roundNumber: number,
  track: string
): number {
  const t = norm(title);
  let bonus = 0;
  // Round number: "r5", "round 5", "race 5".
  const rn = String(roundNumber);
  if (
    new RegExp(`\\br${rn}\\b`).test(t) ||
    new RegExp(`\\bround ${rn}\\b`).test(t) ||
    new RegExp(`\\brace ${rn}\\b`).test(t)
  ) {
    bonus += 6;
  }
  // Track: any track word of 4+ chars appearing in the title.
  const trackWords = norm(track)
    .split(" ")
    .filter((w) => w.length >= 4);
  if (trackWords.some((w) => t.includes(w))) bonus += 6;
  return bonus;
}

export type MatchResult =
  | { ok: true; action: "matched" | "unchanged"; videoId: string }
  | {
      ok: false;
      reason:
        | "round-not-found"
        | "not-configured" // league has no youtubeChannelId
        | "already-set" // a video is already linked (non-force)
        | "no-key" // YOUTUBE_API_KEY missing
        | "channel-not-found"
        | "no-candidate" // no upload in the time window
        | "api-error";
      detail?: string;
    };

/** Pick the best upload for a race start from a pre-fetched upload list. */
export function pickBestUpload(
  uploads: YoutubeUpload[],
  raceInstant: Date,
  roundNumber: number,
  track: string
): YoutubeUpload | null {
  const startMs = raceInstant.getTime();
  const before = WINDOW_BEFORE_H * 3600_000;
  const after = WINDOW_AFTER_H * 3600_000;

  let best: { up: YoutubeUpload; score: number } | null = null;
  for (const up of uploads) {
    const pub = new Date(up.publishedAt).getTime();
    if (Number.isNaN(pub)) continue;
    const diffMs = pub - startMs;
    if (diffMs < -before || diffMs > after) continue; // outside window
    const distH = Math.abs(diffMs) / 3600_000;
    // Lower is better: time distance minus title relevance.
    const score = distH - titleBonusHours(up.title, roundNumber, track);
    if (!best || score < best.score) best = { up, score };
  }
  return best?.up ?? null;
}

/**
 * Match (and store) a YouTube VOD for one round.
 * Pass `force: true` to re-match even if a video is already linked.
 * Pass `uploadsCache` (channelId → uploads) to reuse a fetch across rounds.
 */
export async function matchYoutubeForRound(
  roundId: string,
  opts: {
    force?: boolean;
    uploadsCache?: Map<string, YoutubeUpload[] | null>;
  } = {}
): Promise<MatchResult> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: { select: { youtubeChannelId: true } },
        },
      },
    },
  });
  if (!round) return { ok: false, reason: "round-not-found" };

  const channel = round.season.league.youtubeChannelId;
  if (!channel) return { ok: false, reason: "not-configured" };

  if (round.youtubeVideoId && !opts.force)
    return { ok: false, reason: "already-set" };

  // Resolve + fetch uploads (reuse cached list when provided).
  let uploads: YoutubeUpload[] | null | undefined = opts.uploadsCache?.get(
    channel
  );
  if (uploads === undefined) {
    const playlist = await resolveUploadsPlaylistId(channel);
    if (!playlist.ok) {
      const reason =
        playlist.reason === "no-key"
          ? "no-key"
          : playlist.reason === "not-found"
            ? "channel-not-found"
            : "api-error";
      return { ok: false, reason, detail: playlist.detail };
    }
    const list = await listRecentUploads(playlist.data, 50);
    if (!list.ok) {
      const reason = list.reason === "no-key" ? "no-key" : "api-error";
      opts.uploadsCache?.set(channel, null);
      return { ok: false, reason, detail: list.detail };
    }
    uploads = list.data;
    opts.uploadsCache?.set(channel, uploads);
  }
  if (uploads == null) return { ok: false, reason: "api-error" };

  const raceInstant = reinterpretLocalAsZone(round.startsAt, LEAGUE_TIME_ZONE);
  const best = pickBestUpload(
    uploads,
    raceInstant,
    round.roundNumber,
    round.track
  );
  if (!best) return { ok: false, reason: "no-candidate" };

  if (round.youtubeVideoId === best.videoId)
    return { ok: true, action: "unchanged", videoId: best.videoId };

  await prisma.round.update({
    where: { id: roundId },
    data: { youtubeVideoId: best.videoId, youtubeMatchedAt: new Date() },
  });
  return { ok: true, action: "matched", videoId: best.videoId };
}

export type MatchSweepSummary = {
  matched: { id: string; videoId: string }[];
  noCandidate: string[];
  skipped: { id: string; reason: string }[];
};

/**
 * Cron entrypoint: fill in YouTube videos for recently completed rounds that
 * don't have one yet, across every league with `youtubeChannelId` set.
 * Fetches each channel's uploads once.
 */
export async function matchYoutubeForRecentRounds(): Promise<MatchSweepSummary> {
  const since = new Date(Date.now() - MATCH_LOOKBACK_DAYS * 24 * 3600 * 1000);

  const rounds = await prisma.round.findMany({
    where: {
      status: "COMPLETED",
      youtubeVideoId: null,
      startsAt: { gte: since },
      season: {
        league: { youtubeChannelId: { not: null } },
      },
    },
    select: { id: true },
    orderBy: { startsAt: "desc" },
    take: 200,
  });

  const summary: MatchSweepSummary = {
    matched: [],
    noCandidate: [],
    skipped: [],
  };
  const uploadsCache = new Map<string, YoutubeUpload[] | null>();

  for (const r of rounds) {
    const res = await matchYoutubeForRound(r.id, { uploadsCache });
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
