/**
 * Where do steward penalty points land — on the driver or on his team?
 *
 * On a normal (driver-championship) league a POINTS_DEDUCTION penalty is
 * deducted from the driver's own season total, and the team championship —
 * which is built from driver results — inherits it that way.
 *
 * The IEC is an ENDURANCE team championship: the car is entered by the team,
 * the points are scored by the team (TeamResult rows, one per team and class
 * per round), and the drivers share it. A penalty handed to one driver there
 * has to hit the entry he was driving, not his personal tally — otherwise it
 * is deducted from a championship nobody is racing for and the team keeps the
 * points it was penalised over.
 *
 * Decided with Andreas (race control) on 2026-09-13 for the running IEC
 * season. Deliberately scoped to the one league rather than to "every team
 * event", so no other running season changes how it is scored mid-flight.
 */
const TEAM_PENALTY_LEAGUE_SLUGS = new Set<string>(["cas-iec"]);

/** True when steward penalties score against the TEAM, not the driver. */
export function penaltiesScoreToTeam(
  leagueSlug: string | null | undefined
): boolean {
  return !!leagueSlug && TEAM_PENALTY_LEAGUE_SLUGS.has(leagueSlug);
}
