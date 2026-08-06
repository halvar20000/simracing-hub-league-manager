/**
 * Minimal Twitch Helix client — just enough to list a channel's past
 * broadcasts so the auto-matcher (src/lib/match-twitch.ts) can link a
 * race-stream VOD to a round.
 *
 * Requires TWITCH_CLIENT_ID + TWITCH_CLIENT_SECRET (register an app at
 * https://dev.twitch.tv/console/apps — any OAuth redirect URL works, we only
 * use the client-credentials "app access token" flow, which needs no scopes
 * and no user login).
 *
 * IMPORTANT — VOD retention: Twitch DELETES past broadcasts ("archive") after
 * 7 days (regular), 14 days (Prime/Turbo) or 60 days (Partner). Only
 * "highlight" and "upload" videos are permanent. We still match archives (a
 * link now beats no link) but store the kind on Round.twitchVideoType so the
 * round page can warn that the replay may already be gone.
 *
 * Not a "use server" module — imported by the cron route and the admin
 * server action via match-twitch.ts.
 */

const HELIX = "https://api.twitch.tv/helix";
const OAUTH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

export type TwitchVideo = {
  /** Numeric VOD id, as in twitch.tv/videos/<id>. */
  videoId: string;
  title: string;
  /** For an archive this is the true instant the stream started (ISO 8601). */
  publishedAt: string;
  /** "archive" | "highlight" | "upload". */
  type: string;
  /** Templated URL with %{width}/%{height} placeholders — see thumbUrl(). */
  thumbnailUrl: string;
  /** e.g. "1h12m35s". */
  duration: string;
};

export type TwitchResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: "no-key" | "not-found" | "api-error"; detail?: string };

function creds(): { id: string; secret: string } | null {
  const id = process.env.TWITCH_CLIENT_ID?.trim();
  const secret = process.env.TWITCH_CLIENT_SECRET?.trim();
  return id && secret ? { id, secret } : null;
}

/**
 * Cached app access token. Client-credentials tokens last ~60 days; we keep
 * one per process and refresh a minute before expiry. Module-level state is
 * fine here — the cron runs in a single Node process and a cold start just
 * fetches a fresh token (1 request).
 */
let tokenCache: { token: string; expiresAt: number } | null = null;

async function appAccessToken(): Promise<TwitchResult<string>> {
  const c = creds();
  if (!c) return { ok: false, reason: "no-key" };

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return { ok: true, data: tokenCache.token };
  }

  const body = new URLSearchParams({
    client_id: c.id,
    client_secret: c.secret,
    grant_type: "client_credentials",
  });

  let res: Response;
  try {
    res = await fetch(OAUTH_TOKEN_URL, { method: "POST", body });
  } catch (e) {
    return {
      ok: false,
      reason: "api-error",
      detail: e instanceof Error ? e.message : "fetch failed",
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      reason: "api-error",
      detail: `token HTTP ${res.status}`,
    };
  }
  const json = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
  };
  if (!json.access_token) {
    return { ok: false, reason: "api-error", detail: "no access_token" };
  }
  tokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000,
  };
  return { ok: true, data: json.access_token };
}

/** Authenticated Helix GET. Returns the parsed JSON body. */
async function helix<T>(
  path: string,
  params: URLSearchParams
): Promise<TwitchResult<T>> {
  const c = creds();
  if (!c) return { ok: false, reason: "no-key" };
  const tok = await appAccessToken();
  if (!tok.ok) return tok;

  let res: Response;
  try {
    res = await fetch(`${HELIX}${path}?${params.toString()}`, {
      headers: {
        "Client-Id": c.id,
        Authorization: `Bearer ${tok.data}`,
      },
    });
  } catch (e) {
    return {
      ok: false,
      reason: "api-error",
      detail: e instanceof Error ? e.message : "fetch failed",
    };
  }
  if (res.status === 401) {
    // Token rejected (revoked / rotated secret) — drop the cache so the next
    // call re-authenticates instead of looping on a dead token.
    tokenCache = null;
    return { ok: false, reason: "api-error", detail: "HTTP 401 (bad token)" };
  }
  if (!res.ok) {
    return { ok: false, reason: "api-error", detail: `HTTP ${res.status}` };
  }
  return { ok: true, data: (await res.json()) as T };
}

/**
 * Resolve a channel login ("maxstion", with or without a leading @ or a full
 * twitch.tv URL) to its numeric Twitch user id.
 */
export async function resolveUserId(
  loginOrUrl: string
): Promise<TwitchResult<string>> {
  const login = normalizeChannelLogin(loginOrUrl);
  if (!login) return { ok: false, reason: "not-found", detail: "empty login" };

  const res = await helix<{ data?: { id?: string }[] }>(
    "/users",
    new URLSearchParams({ login })
  );
  if (!res.ok) return res;
  const id = res.data.data?.[0]?.id;
  if (!id) return { ok: false, reason: "not-found", detail: login };
  return { ok: true, data: id };
}

/**
 * Accept anything an admin might paste — "maxstion", "@maxstion",
 * "twitch.tv/maxstion", "https://www.twitch.tv/maxstion?x=1" — and return the
 * bare lowercase login. Returns null if nothing usable is left.
 */
export function normalizeChannelLogin(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  // Strip a URL down to its first path segment.
  const m = s.match(/^(?:https?:\/\/)?(?:www\.|m\.)?twitch\.tv\/([^/?#]+)/i);
  if (m) s = m[1];
  s = s.replace(/^@/, "").trim();
  // Twitch logins are 4-25 chars of [a-zA-Z0-9_].
  return /^[a-zA-Z0-9_]{3,25}$/.test(s) ? s.toLowerCase() : null;
}

/**
 * List a channel's videos, newest first. `type: "all"` covers past broadcasts
 * (archive), highlights and uploads — we want all three, since a broadcaster
 * may turn a race into a permanent highlight.
 */
export async function listChannelVideos(
  userId: string,
  max = 100
): Promise<TwitchResult<TwitchVideo[]>> {
  const out: TwitchVideo[] = [];
  let cursor: string | undefined;

  while (out.length < max) {
    const params = new URLSearchParams({
      user_id: userId,
      type: "all",
      sort: "time",
      first: String(Math.min(100, max - out.length)),
    });
    if (cursor) params.set("after", cursor);

    const res = await helix<{
      data?: {
        id?: string;
        title?: string;
        published_at?: string;
        created_at?: string;
        type?: string;
        thumbnail_url?: string;
        duration?: string;
      }[];
      pagination?: { cursor?: string };
    }>("/videos", params);
    if (!res.ok) return res;

    for (const v of res.data.data ?? []) {
      if (!v.id) continue;
      out.push({
        videoId: v.id,
        title: v.title ?? "",
        publishedAt:
          v.published_at ?? v.created_at ?? new Date(0).toISOString(),
        type: v.type ?? "archive",
        thumbnailUrl: v.thumbnail_url ?? "",
        duration: v.duration ?? "",
      });
    }

    cursor = res.data.pagination?.cursor;
    if (!cursor || !(res.data.data ?? []).length) break;
  }

  return { ok: true, data: out };
}

/**
 * Extract a numeric Twitch VOD id from a pasted URL or a bare id.
 * Handles twitch.tv/videos/123456789, ?video=v123456789 and a raw "v123…".
 * Returns null if nothing usable is found.
 */
export function extractTwitchVideoId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // Bare id, optionally with Twitch's legacy "v" prefix.
  const bare = s.match(/^v?(\d{6,})$/);
  if (bare) return bare[1];
  const path = s.match(/twitch\.tv\/videos\/v?(\d{6,})/i);
  if (path) return path[1];
  const player = s.match(/[?&]video=v?(\d{6,})/i);
  if (player) return player[1];
  return null;
}

/** Public watch URL for a VOD id. */
export function twitchVideoUrl(videoId: string): string {
  return `https://www.twitch.tv/videos/${videoId}`;
}

/**
 * Fill in Twitch's templated thumbnail URL. Twitch returns e.g.
 * ".../thumb-%{width}x%{height}.jpg". Returns null when the template is
 * missing (Twitch leaves it empty for a few minutes after a stream ends).
 */
export function twitchThumbUrl(
  template: string | null | undefined,
  width = 320,
  height = 180
): string | null {
  if (!template) return null;
  const url = template
    .replace(/%\{width\}/g, String(width))
    .replace(/%\{height\}/g, String(height))
    .replace(/\{width\}/g, String(width))
    .replace(/\{height\}/g, String(height));
  return url.includes("%{") ? null : url;
}

/** True for video kinds Twitch deletes after 7-60 days. */
export function isExpiringVodType(type: string | null | undefined): boolean {
  return (type ?? "archive").toLowerCase() === "archive";
}
