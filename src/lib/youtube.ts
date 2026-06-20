/**
 * Minimal YouTube Data API v3 client — just enough to find a channel's
 * recent uploads so the auto-matcher (src/lib/match-youtube.ts) can link a
 * race-stream VOD to a round.
 *
 * Requires the env var YOUTUBE_API_KEY (a public Data API v3 key from a
 * Google Cloud project). Quota cost is tiny: channels.list = 1 unit,
 * playlistItems.list = 1 unit per 50-item page; the default 10,000 units/day
 * is far more than this feature uses.
 *
 * Not a "use server" module — imported by the cron route and the admin
 * server action via match-youtube.ts.
 */

const API_BASE = "https://www.googleapis.com/youtube/v3";

export type YoutubeUpload = {
  videoId: string;
  title: string;
  /** Real instant the video/stream was published (ISO 8601, UTC). */
  publishedAt: string;
};

export type YoutubeResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "no-key" | "not-found" | "api-error"; detail?: string };

function apiKey(): string | null {
  return process.env.YOUTUBE_API_KEY?.trim() || null;
}

/**
 * Does the configured value look like a raw channel ID ("UC" + 22 chars)
 * rather than an @handle? Channel IDs are exactly 24 chars starting "UC".
 */
function isChannelId(v: string): boolean {
  return /^UC[\w-]{22}$/.test(v);
}

/**
 * Resolve the "uploads" playlist ID for a channel given either a channel ID
 * ("UC…") or an @handle (e.g. "@cas-tech-performance7363" — the leading @ is
 * optional). The uploads playlist holds every public upload + finished
 * stream, newest first.
 */
export async function resolveUploadsPlaylistId(
  channelIdOrHandle: string
): Promise<YoutubeResult<string>> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "no-key" };

  const v = channelIdOrHandle.trim();
  const params = new URLSearchParams({ part: "contentDetails", key });
  if (isChannelId(v)) {
    params.set("id", v);
  } else {
    // forHandle accepts the handle with or without a leading "@".
    params.set("forHandle", v.startsWith("@") ? v : `@${v}`);
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/channels?${params.toString()}`);
  } catch (e) {
    return {
      ok: false,
      reason: "api-error",
      detail: e instanceof Error ? e.message : "fetch failed",
    };
  }
  if (!res.ok) {
    return { ok: false, reason: "api-error", detail: `HTTP ${res.status}` };
  }
  const json = (await res.json()) as {
    items?: { contentDetails?: { relatedPlaylists?: { uploads?: string } } }[];
  };
  const uploads = json.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) return { ok: false, reason: "not-found" };
  return { ok: true, data: uploads };
}

/**
 * List a channel's most recent uploads (newest first). `max` caps how many
 * are returned (paged 50 at a time). 50–100 covers months of a typical
 * league channel — far enough back to match any recently completed round.
 */
export async function listRecentUploads(
  uploadsPlaylistId: string,
  max = 50
): Promise<YoutubeResult<YoutubeUpload[]>> {
  const key = apiKey();
  if (!key) return { ok: false, reason: "no-key" };

  const out: YoutubeUpload[] = [];
  let pageToken: string | undefined;

  while (out.length < max) {
    const params = new URLSearchParams({
      part: "snippet,contentDetails",
      playlistId: uploadsPlaylistId,
      maxResults: String(Math.min(50, max - out.length)),
      key,
    });
    if (pageToken) params.set("pageToken", pageToken);

    let res: Response;
    try {
      res = await fetch(`${API_BASE}/playlistItems?${params.toString()}`);
    } catch (e) {
      return {
        ok: false,
        reason: "api-error",
        detail: e instanceof Error ? e.message : "fetch failed",
      };
    }
    if (!res.ok) {
      return { ok: false, reason: "api-error", detail: `HTTP ${res.status}` };
    }
    const json = (await res.json()) as {
      nextPageToken?: string;
      items?: {
        snippet?: { title?: string; publishedAt?: string };
        contentDetails?: { videoId?: string; videoPublishedAt?: string };
      }[];
    };
    for (const it of json.items ?? []) {
      const videoId = it.contentDetails?.videoId;
      if (!videoId) continue;
      out.push({
        videoId,
        title: it.snippet?.title ?? "",
        // videoPublishedAt is the true publish/stream instant; snippet
        // publishedAt (added-to-playlist time) is the fallback.
        publishedAt:
          it.contentDetails?.videoPublishedAt ??
          it.snippet?.publishedAt ??
          new Date(0).toISOString(),
      });
    }
    pageToken = json.nextPageToken;
    if (!pageToken) break;
  }

  return { ok: true, data: out };
}

/**
 * Extract an 11-char YouTube video ID from a pasted URL or a bare ID.
 * Handles watch?v=, youtu.be/, /live/, /embed/, /shorts/ and a raw ID.
 * Returns null if nothing usable is found.
 */
export function extractYoutubeVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare 11-char ID.
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const url = new URL(s);
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const m = url.pathname.match(/\/(?:live|embed|shorts|v)\/([\w-]{11})/);
    if (m) return m[1];
    if (/^(www\.)?youtu\.be$/i.test(url.hostname)) {
      const id = url.pathname.slice(1, 12);
      if (/^[\w-]{11}$/.test(id)) return id;
    }
  } catch {
    // Not a URL — fall through.
  }
  // Last resort: first 11-char token that looks like an ID.
  const m = s.match(/[\w-]{11}/);
  return m ? m[0] : null;
}
