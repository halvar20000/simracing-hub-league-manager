/**
 * One place that decides whether a season is still "live".
 *
 * `Season.isArchived` takes a finished season out of circulation without
 * deleting it. The rule, deliberately, is not symmetrical:
 *
 *   LIVE surfaces hide it   — home page, the season grid and active-season
 *                             hero on a league page, /rosters, /calendar and
 *                             the ICS feed, /streams, /reporting, the overlay
 *                             API, and every Discord cron. New registrations
 *                             are refused.
 *   HISTORY surfaces keep it — Hall of Fame, driver career profiles, /teams,
 *                             /incidents. A champion stays a champion and a
 *                             driver keeps the races he drove.
 *   DIRECT URLs keep working — standings, roster and round pages of an
 *                             archived season still open, so links already
 *                             posted in Discord or a YouTube description
 *                             don't rot.
 *
 * Import the fragment instead of writing `isArchived: false` by hand, so a
 * future rule change lands in one file. Mirrors `League.isArchived`, which is
 * checked the same way — a season is only live if its league is live too.
 */

/** Spread into a `prisma.season.findMany({ where })`. */
export const liveSeasonWhere = {
  isArchived: false,
  league: { isArchived: false },
} as const;

/**
 * Spread into a `where` on a model that BELONGS to a season (Round,
 * Registration, Team, RaceResult, …).
 */
export const liveSeasonFilter = {
  season: liveSeasonWhere,
} as const;

/**
 * Spread into the nested `seasons: { where }` of a `prisma.league.findMany`.
 * The league itself is already the parent, so only the season flag applies.
 */
export const liveSeasonNested = { isArchived: false } as const;

/** True when this season may still appear on a live surface. */
export function isSeasonLive(season: {
  isArchived: boolean;
  league?: { isArchived: boolean } | null;
}): boolean {
  return !season.isArchived && season.league?.isArchived !== true;
}
