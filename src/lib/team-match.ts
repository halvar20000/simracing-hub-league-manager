/**
 * Which CLS team does an iRacing team entry (one car) belong to?
 *
 * Used by the iRacing JSON import for team events (IEC). Pure — no Prisma —
 * so it can be tested in isolation.
 *
 * Order of evidence, strongest first:
 *   1. NAME — the iRacing team name equals the CLS team name once case,
 *      spaces and punctuation are ignored ("Jurassic Kart Racing Brachiosaurus"
 *      = "Jurassic Kart Racing - Brachiosaurus"). The team types that name in
 *      iRacing itself, so it is the best signal there is.
 *   2. IRACING ID — Team.iracingTeamId learned by an earlier import.
 *   3. CREW — the CLS team most of the crew is registered with, weighted by
 *      laps driven.
 *
 * Until v2.38.1 the import used (2) and then the team of the FIRST driver in
 * the file, and silently dropped a car whose team was already taken. In the
 * IEC 3h Fuji round two Jurassic GT3 cars had crews registered across both
 * teams: the Brachiosaurus car was stored as Velociraptor (its first driver was
 * registered there) and the real Velociraptor car vanished from the results.
 *
 * A team already given to another car of the same race is never reused: the
 * next candidate is tried, and when none is left the car is reported as
 * unmatched instead of being dropped without a word.
 */

export function normTeamName(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export type TeamMatchVia = "name" | "iracing-id" | "crew";

export function pickClsTeam(input: {
  displayName: string;
  /** CLS team id already holding this iRacing team id in the season, if any. */
  teamIdByIracingId: string | null;
  /** normTeamName(CLS team name) → CLS team id, for the season. */
  teamIdByNormName: Map<string, string>;
  /** The crew's registrations: CLS team + laps driven in this race. */
  crew: { teamId: string | null; laps: number }[];
  /** CLS teams already given to another car in this race. */
  used: Set<string>;
}): { teamId: string; via: TeamMatchVia } | null {
  const candidates: { teamId: string; via: TeamMatchVia }[] = [];
  const byName = input.teamIdByNormName.get(normTeamName(input.displayName));
  if (byName) candidates.push({ teamId: byName, via: "name" });
  if (input.teamIdByIracingId)
    candidates.push({ teamId: input.teamIdByIracingId, via: "iracing-id" });

  // Crew vote: laps first, then head count, then file order.
  const votes = new Map<string, { laps: number; heads: number; first: number }>();
  input.crew.forEach((c, i) => {
    if (!c.teamId) return;
    const v = votes.get(c.teamId) ?? { laps: 0, heads: 0, first: i };
    v.laps += c.laps;
    v.heads += 1;
    votes.set(c.teamId, v);
  });
  [...votes.entries()]
    .sort(
      ([, a], [, b]) => b.laps - a.laps || b.heads - a.heads || a.first - b.first
    )
    .forEach(([teamId]) => candidates.push({ teamId, via: "crew" }));

  return candidates.find((c) => !input.used.has(c.teamId)) ?? null;
}
