/**
 * Timezone correction for Discord native timestamps.
 *
 * ── The underlying quirk ────────────────────────────────────────────
 * Admin-entered round / stream times come from <input type="datetime-
 * local"> fields, which produce a naive wall-clock string like
 * "2026-05-20T19:00". The server actions do `new Date(thatString)`.
 * On Vercel the server runs in UTC, so JavaScript interprets the
 * string as 19:00 **UTC** — even though the admin meant 19:00 local
 * (Europe/Berlin). The value is therefore stored as "the wall-clock
 * time, but tagged UTC".
 *
 * The rest of the app never notices: every screen formats times with
 * .getUTCHours()/.getHours() the same way, so "19:00" goes in and
 * "19:00" comes out — internally consistent.
 *
 * Discord is the exception. `<t:UNIX:F>` renders the instant in each
 * viewer's real timezone. Feeding it the raw stored instant (19:00
 * "UTC") makes Discord show 21:00 for a Berlin viewer (UTC+2 in
 * summer). That's the 2-hour error.
 *
 * ── The fix ─────────────────────────────────────────────────────────
 * Before computing a Discord `<t:>` timestamp, re-interpret the stored
 * value's UTC wall-clock fields (19:00) as LEAGUE_TZ local time and
 * return the true instant (17:00 UTC in summer). DST is handled
 * correctly because the offset is derived from the actual date via
 * Intl.
 *
 * This is intentionally scoped to the Discord boundary only — no data
 * migration, no change to how the rest of the app stores or displays
 * times.
 */

/** All CAS leagues run on Central European Time. Europe/Berlin and
 * Europe/Paris share the exact same CET/CEST offsets year-round. */
export const LEAGUE_TZ = "Europe/Berlin";

/**
 * Convert a "wall-clock-stored-as-UTC" Date into the true instant,
 * treating its UTC wall-clock fields as LEAGUE_TZ local time.
 *
 *   stored 2026-05-20T19:00:00Z  ->  true 2026-05-20T17:00:00Z
 *   (because 19:00 Europe/Berlin in May = 17:00 UTC)
 */
export function wallClockToInstant(stored: Date): Date {
  const y = stored.getUTCFullYear();
  const mo = stored.getUTCMonth();
  const d = stored.getUTCDate();
  const h = stored.getUTCHours();
  const mi = stored.getUTCMinutes();
  const s = stored.getUTCSeconds();

  // First approximation: treat the wall-clock fields as if they were
  // UTC. We then measure how far LEAGUE_TZ is from UTC at that moment.
  const asUtc = Date.UTC(y, mo, d, h, mi, s);

  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: LEAGUE_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(asUtc));
  const map: Record<string, string> = {};
  for (const p of parts) map[p.type] = p.value;
  // Intl can emit "24" for midnight — normalise to "00".
  const hour = map.hour === "24" ? "00" : map.hour;

  const tzWall = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(hour),
    Number(map.minute),
    Number(map.second)
  );

  // offsetMs = how far LEAGUE_TZ's wall clock runs ahead of UTC at
  // that instant (+2h in summer / CEST, +1h in winter / CET).
  const offsetMs = tzWall - asUtc;

  // The real instant whose LEAGUE_TZ wall clock equals the stored
  // wall-clock fields.
  return new Date(asUtc - offsetMs);
}

/**
 * Unix seconds for a Discord `<t:…>` tag, corrected for the
 * wall-clock-as-UTC storage quirk. Pass any admin-entered Date
 * (Round.startsAt, StreamAnnouncement.scheduledStreamAt, …).
 */
export function discordTimestamp(stored: Date): number {
  return Math.floor(wallClockToInstant(stored).getTime() / 1000);
}
