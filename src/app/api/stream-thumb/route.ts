/**
 * Race-stream thumbnail proxy.
 *
 * The /streams page and the admin round page show YouTube / Twitch preview
 * images. Pointing an <img> straight at i.ytimg.com or the Twitch CDN makes the
 * visitor's browser contact Google / Amazon on page load — a third-party
 * transfer of their IP address before they asked to watch anything, and the
 * same problem the click-to-load player (RaceStreamEmbed) exists to avoid.
 *
 * So the server fetches the image instead and streams the bytes back from our
 * own origin. The visitor's browser only ever talks to league.simracing-hub.com.
 *
 * NOT an open proxy: `yt` must be an 11-char YouTube id, and `tw` must be a URL
 * on Twitch's own CDN host. Anything else is rejected, so this can't be pointed
 * at internal addresses or used to launder arbitrary traffic.
 *
 * See /datenschutz section 10.
 */

export const runtime = "nodejs";

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const TWITCH_THUMB_HOSTS = new Set([
  "static-cdn.jtvnw.net",
  "vod-secure.twitch.tv",
]);

/** One day in the browser, one day at the edge — thumbnails never change. */
const CACHE_CONTROL = "public, max-age=86400, s-maxage=86400, immutable";

function resolveUpstream(url: URL): string | null {
  const yt = url.searchParams.get("yt");
  if (yt) {
    return YT_ID_RE.test(yt)
      ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg`
      : null;
  }

  const tw = url.searchParams.get("tw");
  if (tw) {
    let parsed: URL;
    try {
      parsed = new URL(tw);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:") return null;
    if (!TWITCH_THUMB_HOSTS.has(parsed.hostname)) return null;
    return parsed.toString();
  }

  return null;
}

export async function GET(request: Request) {
  const upstream = resolveUpstream(new URL(request.url));
  if (!upstream) {
    return new Response("Bad thumbnail request", { status: 400 });
  }

  try {
    const res = await fetch(upstream, {
      // Send no referrer and no cookies upstream — the point is that the
      // provider learns as little as possible, and nothing about the visitor.
      referrerPolicy: "no-referrer",
      cache: "force-cache",
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok || !res.body) {
      // A deleted Twitch VOD 404s here. The card falls back to its gradient.
      return new Response(null, { status: 404 });
    }

    const contentType = res.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return new Response(null, { status: 404 });
    }

    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
