/**
 * Minimal iRacing /data API client used by the admin track-list refresh
 * flow. NOT used for race-result imports — those still go through the
 * uploaded-JSON path.
 *
 * Auth flow (matches the official iRacing /data API contract):
 *   1. SHA-256( password + email.toLowerCase() ), base64-encoded
 *   2. POST /auth with { email, password: <hashed> }
 *   3. Read Set-Cookie headers — we re-send them on every subsequent
 *      call. iRacing's session lasts ~1 hour, plenty for a one-shot
 *      refresh job.
 *
 * /data endpoints return { link: "<short-lived S3 URL>" } and you fetch
 * the link to get the actual payload. We follow that link transparently.
 *
 * Env vars required: IRACING_EMAIL, IRACING_PASSWORD. Set both on Vercel
 * (Project Settings → Environment Variables) and in .env.local for dev.
 *
 * If creds are missing or auth fails, every helper throws with a clear
 * message; callers should catch and degrade gracefully.
 */
import { createHash } from "node:crypto";

const BASE = "https://members-ng.iracing.com";

function hashPassword(email: string, password: string): string {
  // iRacing requires SHA-256 of (password + lowercased-email), base64'd.
  const h = createHash("sha256");
  h.update(password + email.toLowerCase());
  return h.digest("base64");
}

/**
 * POST /auth. Returns the raw Cookie header string to forward on later
 * calls. Throws on failure (wrong creds, captcha required, etc.).
 */
async function authIracing(): Promise<string> {
  const email = process.env.IRACING_EMAIL;
  const password = process.env.IRACING_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "IRACING_EMAIL and IRACING_PASSWORD env vars are required"
    );
  }

  const res = await fetch(`${BASE}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email,
      password: hashPassword(email, password),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`iRacing auth failed: ${res.status} ${text.slice(0, 200)}`);
  }

  // iRacing might prompt for captcha / MFA on a fresh / suspicious login.
  // In that case the response body has { verificationRequired: true } and
  // status is still 200 — surface that as a clear error.
  const body = (await res.json().catch(() => ({}))) as {
    verificationRequired?: boolean;
    authcode?: number | string;
  };
  if (body.verificationRequired) {
    throw new Error(
      "iRacing requires CAPTCHA / MFA verification. Log in once via members.iracing.com, complete the prompt, then retry."
    );
  }
  if (!body.authcode) {
    throw new Error("iRacing auth: missing authcode in response.");
  }

  // Collect cookies from Set-Cookie header(s).
  const rawCookies = res.headers.getSetCookie?.() ?? [];
  if (rawCookies.length === 0) {
    throw new Error("iRacing auth: no Set-Cookie returned.");
  }
  const cookieHeader = rawCookies
    .map((c) => c.split(";")[0]!.trim())
    .filter(Boolean)
    .join("; ");
  return cookieHeader;
}

/**
 * Generic /data GET helper. Iracing returns { link } pointing at S3 —
 * we follow it transparently and parse JSON.
 */
async function fetchData<T>(path: string, cookie: string): Promise<T> {
  const r1 = await fetch(`${BASE}${path}`, { headers: { Cookie: cookie } });
  if (!r1.ok) {
    throw new Error(`iRacing GET ${path} failed: ${r1.status}`);
  }
  const wrap = (await r1.json()) as { link?: string };
  if (!wrap.link) {
    // Some endpoints return data inline (no link). Try treating r1 body
    // as the payload directly.
    return wrap as unknown as T;
  }
  const r2 = await fetch(wrap.link);
  if (!r2.ok) {
    throw new Error(`iRacing S3 follow ${path} failed: ${r2.status}`);
  }
  return (await r2.json()) as T;
}

export interface IracingTrackRaw {
  track_id: number;
  track_name: string;
  config_name?: string | null;
  category?: string | null;
  free_with_subscription?: boolean;
  // … (many more fields we don't care about)
}

/**
 * Fetch the full iRacing track catalogue. One auth + two HTTP requests.
 */
export async function fetchAllIracingTracks(): Promise<IracingTrackRaw[]> {
  const cookie = await authIracing();
  const data = await fetchData<IracingTrackRaw[]>("/data/track/get", cookie);
  if (!Array.isArray(data)) {
    throw new Error("iRacing /data/track/get: unexpected shape (not array)");
  }
  return data;
}
