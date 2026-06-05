// Leagues that have NO team competition at all — every team-results /
// team-standings tab, table and column is hidden on their public pages.
// Add a slug here to hide team UI for another league.
const NO_TEAM_COMPETITION_SLUGS = new Set(["cas-pccd"]);

export function leagueHasTeamCompetition(slug: string): boolean {
  return !NO_TEAM_COMPETITION_SLUGS.has(slug);
}
