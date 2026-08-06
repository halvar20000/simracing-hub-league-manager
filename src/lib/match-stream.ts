/**
 * Shared helpers for linking a race-stream replay to a round.
 *
 * Used by BOTH stream matchers, which deliberately rank differently:
 *   - src/lib/match-youtube.ts — TITLE-first. YouTube VODs are re-uploads
 *     posted hours-to-days after the race, so publish time is unreliable.
 *   - src/lib/match-twitch.ts  — DATE-first. A Twitch "archive" VOD carries
 *     the true live-broadcast start, so it lands within minutes of the race;
 *     titles, by contrast, can be actively wrong (CAS's SFL stream titled
 *     "Rennen drei" is in fact round 4, because round 3 was postponed).
 *
 * Not a "use server" module.
 */

/** CLS stores round start times as a naive wall-clock in German time. */
export const LEAGUE_TIME_ZONE = "Europe/Berlin";

/** How many ms a timezone is ahead of UTC at a given instant (DST-aware). */
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
export function reinterpretLocalAsZone(d: Date, timeZone: string): Date {
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

/** Lowercase; every run of non-alphanumerics becomes a single space. */
export function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Words that appear in titles/track names but don't identify a venue.
export const TRACK_STOPWORDS = new Set([
  "the", "gp", "circuit", "international", "speedway", "grand", "prix",
  "street", "park", "raceway", "motorsport", "motor", "sim", "tv", "cas",
  "gt3", "gt4", "wct", "iec", "pccd", "sfl", "tss", "season", "finale",
  "lauf", "round", "race", "und", "der", "die", "rennen", "cup",
  "livestream", "cast", "autodromo", "internazionale", "de", "del",
]);

/**
 * True if the title mentions the round's track. Driven by the (short) track
 * name's own tokens: some venue word of 3+ chars that isn't a stopword must
 * appear in the title. e.g. track "Spa-Francorchamps" → token "spa".
 */
export function trackMatches(title: string, track: string): boolean {
  const t = norm(title);
  const tokens = norm(track)
    .split(" ")
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !TRACK_STOPWORDS.has(w));
  return tokens.length > 0 && tokens.some((w) => t.includes(w));
}
