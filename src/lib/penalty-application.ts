/**
 * Per-race penalty application mode (GT3 WCT, 13th Season onward).
 *
 * Old mode (12th Season and earlier — "deferred pool"):
 *   Incident penalty points accumulate in the pool all season; clean races
 *   auto-forgive; at season end the admin RELEASES the remaining pool, which
 *   is then deducted from the championship totals.
 *
 * New mode (per-race):
 *   - Incident penalty points (steward decisions) are deducted IMMEDIATELY in
 *     the round where the incident happened — in driver standings AND in team
 *     scoring (the penalty-adjusted points also decide which drivers count
 *     for the team's best-N).
 *   - The penalty pool keeps tracking every incident penalty, but ONLY to
 *     compute forgiveness (2 clean races → 1 point forgiven, FIFO).
 *   - When the season is set to COMPLETED, the total forgiveness earned
 *     (auto + manual) is credited back to the driver's SEASON TOTAL.
 *     Individual race results stay untouched.
 *   - NO_RSVP_NO_SHOW penalties never hit individual races: they are deducted
 *     from the season total only when the season is COMPLETED.
 *   - Penalty.releasedAt is ignored in this mode; the Release buttons are
 *     hidden for per-race seasons.
 *
 * Gating is hardcoded by league + legacy season id because both GT3 WCT
 * seasons share one ScoringSystem row, so a scoring-system flag would leak
 * the new behaviour into the completed 12th Season.
 */

/** GT3 WCT seasons that keep the OLD deferred-pool behaviour. */
const LEGACY_DEFERRED_GT3_SEASON_IDS = new Set<string>([
  "cmoeftuep0009lb04dlxe44ad", // GT3 WCT 12th Season (completed June 2026)
]);

export function isPerRacePenaltySeason(
  leagueSlug: string,
  seasonId: string
): boolean {
  return (
    leagueSlug === "cas-gt3-wct" &&
    !LEGACY_DEFERRED_GT3_SEASON_IDS.has(seasonId)
  );
}
