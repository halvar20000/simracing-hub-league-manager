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
 * Date windows (in days) around the race. Channels often RE-UPLOAD the stream
 * as a VOD hours-to-days after the race (CAS uploads the Twitch recording the
 * next day, at arbitrary times), so the publish time is NOT a reliable "live"
 * timestamp. We therefore match mainly by TITLE (round number + track) within a
 * generous window, and only fall back to pure date proximity for channels whose
 * titles carry no useful info. The window's job is just to keep us in the right
 * season (same round-number+track repeats across seasons, months apart).
 */
const WINDOW_TITLE_DAYS = 45; // title round# + track match
const WINDOW_TRACK_DAYS = 30; // track-only match
const WINDOW_ROUND_DAYS = 4; // round#-only match (weak: repeats across series)
const WINDOW_DATE_DAYS = 1.5; // last-resort date-only match

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
 * Pull the round number out of a video title. Handles the German "Lauf N"
 * (CAS uses this) plus English "Round N" / "Race N" / "RN". Returns null if
 * none is present (e.g. a "Finale …" title).
 */
function parseRoundNumber(title: string): number | null {
  const t = norm(title);
  const m =
    t.match(/\blauf\s*(\d{1,2})\b/) ||
    t.match(/\bround\s*(\d{1,2})\b/) ||
    t.match(/\brace\s*(\d{1,2})\b/) ||
    t.match(/\br(\d{1,2})\b/);
  return m ? parseInt(m[1], 10) : null;
}

// Words that appear in titles/track names but don't identify a venue.
const TRACK_STOPWORDS = new Set([
  "the", "gp", "circuit", "international", "speedway", "grand", "prix",
  "street", "park", "raceway", "motorsport", "motor", "sim", "tv", "cas",
  "gt3", "gt4", "wct", "iec", "pccd", "sfl", "tss", "season", "finale",
  "lauf", "round", "race", "und", "der", "die",
]);

/**
 * True if the title mentions the round's track. Driven by the (short) track
 * name's own tokens: every venue word of 3+ chars that isn't a stopword must
 * appear somewhere in the title. e.g. track "Spa-Francorchamps" → token "spa".
 */
function trackMatches(title: string, track: string): boolean {
  const t = norm(title);
  const tokens = norm(track)
    .split(" ")
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !TRACK_STOPWORDS.has(w));
  return tokens.length > 0 && tokens.some((w) => t.includes(w));
}

/**
 * Pick the best upload for a round. CAS re-uploads stream VODs days after the
 * race with clean titles ("Lauf 11 CAS - GT3 WCT - Thruxton Circuit"), so we
 * rank by title match first and use the date only to stay in the right season.
 * Tiers (best first):
 *   3  round number AND track match  (±45d)
 *   2  track match                   (±30d)
 *   1  round number match            (±4d — weak: numbers repeat across series)
 *   0  date proximity only           (±1.5d — channels with uninformative titles)
 * Within a tier, the upload closest to the race date wins.
 */
export function pickBestUpload(
  uploads: YoutubeUpload[],
  raceInstant: Date,
  roundNumber: number,
  track: string
): YoutubeUpload | null {
  const startMs = raceInstant.getTime();
  const DAY = 86_400_000;

  let best: { up: YoutubeUpload; tier: number; absDays: number } | null = null;
  for (const up of uploads) {
    const pub = new Date(up.publishedAt).getTime();
    if (Number.isNaN(pub)) continue;
    const absDays = Math.abs(pub - startMs) / DAY;

    const rnMatch = parseRoundNumber(up.title) === roundNumber;
    const tkMatch = trackMatches(up.title, track);

    let tier = -1;
    if (rnMatch && tkMatch && absDays <= WINDOW_TITLE_DAYS) tier = 3;
    else if (tkMatch && absDays <= WINDOW_TRACK_DAYS) tier = 2;
    else if (rnMatch && absDays <= WINDOW_ROUND_DAYS) tier = 1;
    else if (absDays <= WINDOW_DATE_DAYS) tier = 0;
    if (tier < 0) continue;

    if (
      !best ||
      tier > best.tier ||
      (tier === best.tier && absDays < best.absDays)
    ) {
      best = { up, tier, absDays };
    }
  }
  return best?.up ?? null;
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
    const list = await listRecentUploads(playlist.data, 100);
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
