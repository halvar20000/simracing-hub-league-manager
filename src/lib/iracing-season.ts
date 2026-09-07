/**
 * Which iRacing season a date falls in.
 *
 * WHY THIS EXISTS: the Series Insights export carries the race WEEK but not
 * the season in any human form — only an internal `season_id` (6301, 6312 …)
 * that means nothing outside iRacing's database and differs per series. So the
 * season has to be typed by hand, and a hand-typed season is a season that
 * will one day say S4 when it was S3. It happened, four curves at once.
 *
 * The arithmetic instead: iRacing runs exactly 13-week seasons that roll
 * without a gap, each starting at midnight GMT on a Tuesday. One verified
 * anchor therefore fixes every season before and after it.
 *
 * ANCHOR: 2026 Season 3 race week 1 began on Tuesday 16 June 2026 — the
 * Tuesday AFTER its build (iRacing deploys on a Tuesday and the season starts
 * a week later; iracing.com/seasons/ lists the BUILD dates: 2026 S1 on 9 Dec
 * 2025, S2 on 10 Mar 2026, S3 on 9 Jun 2026, 91 days apart to the day).
 *
 * Verified against the live members site on 7 Sep 2026: the header read
 * "Season 3 — Week 12 of 13", and iRacing's own system message said "2026
 * Season 4 Week 1 begins on September 14th" (their dates are US Eastern, so
 * that is Tuesday 15 Sep 00:00 GMT). Anchoring on the BUILD date instead put
 * every season a week early — close enough to look right all season and wrong
 * exactly in the week a season turns over.
 *
 * A date within hours of a season boundary can still land on the wrong side
 * of it (iRacing announces in US Eastern, this counts in GMT). That is why
 * every caller puts the result in an editable field instead of storing it
 * silently. If iRacing ever changes the season length, this one constant is
 * the only thing to correct.
 *
 * Pure module: no DB, no React.
 */

/** Race week 1 of 2026 Season 3: 00:00 GMT, Tuesday 16 June 2026. */
const ANCHOR_MS = Date.UTC(2026, 5, 16);
const ANCHOR_YEAR = 2026;
const ANCHOR_QUARTER = 3;

/** Race weeks in a season. 12 plus the week that used to be "week 13". */
export const SEASON_WEEKS = 13;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export type IracingSeason = {
  /** The year the season is NAMED for — 2026 S1 begins in December 2025. */
  year: number;
  /** 1-4. */
  quarter: number;
  /** 1-based race week, 1…13. */
  week: number;
  /** "2026 S3". */
  label: string;
};

/** The season and race week containing `at` (defaults to now). */
export function iracingSeasonAt(at: Date = new Date()): IracingSeason {
  const weeks = Math.floor((at.getTime() - ANCHOR_MS) / WEEK_MS);
  // Floor division, so dates BEFORE the anchor walk backwards correctly.
  const seasons = Math.floor(weeks / SEASON_WEEKS);
  const week = weeks - seasons * SEASON_WEEKS + 1;

  // Quarters count from 0 so the wrap across the year is plain arithmetic.
  const total = ANCHOR_YEAR * 4 + (ANCHOR_QUARTER - 1) + seasons;
  const year = Math.floor(total / 4);
  const quarter = (total % 4) + 1;

  return { year, quarter, week, label: `${year} S${quarter}` };
}

/** "2026 S3" for the season containing `at`. */
export function iracingSeasonLabel(at: Date = new Date()): string {
  return iracingSeasonAt(at).label;
}
