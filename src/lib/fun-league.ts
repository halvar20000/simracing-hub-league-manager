/**
 * CAS Fun League — one-off races picked by member vote, no real championship.
 *
 * The points are still added up (one open-ended season, ordinary scoring), but
 * only as a joke "eternal table": its leader carries the title "CAS Eternal
 * Champion". So everywhere the site would say "Standings" these leagues say
 * "Eternal Champion" instead. Pure + not "use server" — imported by pages, the
 * registration action and the Discord results post alike.
 */
const ETERNAL_CHAMPION_LEAGUE_SLUGS = new Set<string>(["cas-fun-league"]);

export function isEternalChampionLeague(slug: string): boolean {
  return ETERNAL_CHAMPION_LEAGUE_SLUGS.has(slug);
}

/** Label for links/headings that point at the season standings page. */
export function standingsLabel(slug: string): string {
  return isEternalChampionLeague(slug) ? "Eternal Champion" : "Standings";
}

/**
 * Leagues whose registration form asks for the driver's iRating (required)
 * without any cap. The SFL Cup has its own capped iRating field
 * (src/lib/sfl-irating-gate.ts) and is not listed here.
 */
export function registrationAsksIRating(slug: string): boolean {
  return isEternalChampionLeague(slug);
}
