/**
 * Penalty application mode for GT3 WCT.
 *
 * REVERTED (June 2026): the per-race deduction experiment has been rolled
 * back. ALL GT3 WCT seasons now use the original "deferred pool" behaviour:
 *
 *   Incident penalty points accumulate in the pool all season; clean races
 *   auto-forgive; at season end the admin RELEASES the remaining pool, which
 *   is then deducted from the championship totals. Penalties never hit an
 *   individual round's standings until they are released.
 *
 * This function is kept (always returning false) so the per-race branches at
 * its call sites stay compiled but inert — a single switch fully restores the
 * old behaviour without unpicking the woven scoring code. If the per-race
 * mode is permanently abandoned, those dead branches can be deleted later.
 */
export function isPerRacePenaltySeason(
  _leagueSlug: string,
  _seasonId: string
): boolean {
  // Per-race mode reverted — every season uses the deferred pool.
  return false;
}
