/**
 * Per-league iRating category map.
 *
 * Different CLS leagues are gated/scored against different iRating
 * categories — they are NOT interchangeable. The SFL Cup is a formula
 * league (Super Formula Lights) so it uses each driver's *Formula Car*
 * iRating; every other league uses *Sports Car* iRating.
 *
 * This module is the single source of truth — anything that reads or
 * displays an iRating in a league context (register form label,
 * admin/public rosters, gates, CSV exports) should resolve the
 * category through here rather than hardcoding `iratingSportsCar`.
 */
export type IRatingCategory = "sports_car" | "formula_car" | "oval";

const LEAGUE_IRATING_CATEGORY: Record<string, IRatingCategory> = {
  "cas-sfl-cup": "formula_car",
  "nascar-cas-cup": "oval",
};

const DEFAULT_CATEGORY: IRatingCategory = "sports_car";

/** Which iRating category applies to a given league slug. */
export function getLeagueIratingCategory(slug: string): IRatingCategory {
  return LEAGUE_IRATING_CATEGORY[slug] ?? DEFAULT_CATEGORY;
}

/** Short label used in register-form / roster headers ("Sports Car", "Formula Car"). */
export function iratingCategoryShortLabel(c: IRatingCategory): string {
  switch (c) {
    case "formula_car":
      return "Formula Car";
    case "oval":
      return "Oval";
    case "sports_car":
    default:
      return "Sports Car";
  }
}

/**
 * Read the live (synced from iRacing) iRating for a user in the given
 * league's category. Returns null when the User hasn't been synced.
 *
 * The user must have been loaded with `iratingSportsCar`,
 * `iratingFormulaCar`, `iratingOval` selected — `prisma.user.findUnique`
 * without an explicit `select` already includes them.
 */
export function getUserLiveIratingForLeague(
  user: {
    iratingSportsCar: number | null;
    iratingFormulaCar: number | null;
    iratingOval: number | null;
  },
  slug: string
): number | null {
  const cat = getLeagueIratingCategory(slug);
  switch (cat) {
    case "formula_car":
      return user.iratingFormulaCar;
    case "oval":
      return user.iratingOval;
    case "sports_car":
    default:
      return user.iratingSportsCar;
  }
}
