/**
 * Team grouping — collapse per-season "subteams" into their main team.
 *
 * In the schema a `Team` is per-season, and a real-world team often enters
 * several lettered/coloured subteams (e.g. "CAS Tech Performance Green",
 * "CAS Tech Performance Blue", "Alemannia Aachen White"). The public Teams
 * overview wants to show ONE box per main team.
 *
 * Strategy (matches the product decision "auto-strip suffixes + override"):
 *   1. An explicit overrides map for cases the heuristic can't guess.
 *   2. A heuristic that strips trailing colour / number / single-letter /
 *      roman-numeral suffix tokens.
 *
 * NOTE: the override is a code-level map (not a DB column) on purpose — it
 * keeps this change schema-free and fully version-controlled. To fix a
 * mis-grouping, add a line to TEAM_NAME_OVERRIDES and redeploy. If you later
 * want to edit overrides from the admin UI, promote this to a
 * `Team.mainTeamName` column and check it first inside canonicalTeamName.
 */

/**
 * Force-map a raw team name to its main team. Keyed by the lower-cased,
 * whitespace-collapsed raw name. Use this when:
 *   - the heuristic strips too much or too little, OR
 *   - two subteams should be merged but don't share a clean prefix, OR
 *   - two teams share a prefix but must stay SEPARATE (map each to a
 *     distinct main name).
 *
 * Example:
 *   "cas tech performance junior": "CAS Tech Performance",
 */
export const TEAM_NAME_OVERRIDES: Record<string, string> = {
  // Seed examples (the heuristic already handles the simple colour cases —
  // these are here as documentation / safety net).
  // "alemannia aachen youth": "Alemannia Aachen",
};

// Suffix tokens that mark a subteam variant. Lower-cased, no punctuation.
const SUFFIX_TOKENS = new Set<string>([
  // English colours
  "red", "blue", "green", "yellow", "black", "white", "orange", "purple",
  "pink", "gold", "silver", "grey", "gray", "cyan", "magenta", "bronze",
  "teal", "violet", "brown", "navy", "lime", "aqua", "maroon",
  // German colours
  "rot", "blau", "gruen", "grün", "gelb", "schwarz", "weiss", "weiß",
  "lila", "violett", "gold", "silber", "grau", "tuerkis", "türkis",
  "braun", "rosa",
  // NOTE: deliberately NOT stripping generic words like "Team", "Junior",
  // "Academy", "Reserve" — they appear in real distinct team names and would
  // cause silent over-merging. Handle those edge cases via TEAM_NAME_OVERRIDES.
]);

// Roman numerals I..X (subteam designators like "Team II").
const ROMAN = new Set([
  "i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x",
]);

function isSuffixToken(tokenRaw: string): boolean {
  // Strip surrounding punctuation / parentheses, e.g. "(Blue)" or "#2".
  const t = tokenRaw.replace(/[()[\]{}.#,:;-]/g, "").toLowerCase();
  if (t.length === 0) return true; // a lone separator like "-"
  if (SUFFIX_TOKENS.has(t)) return true;
  if (ROMAN.has(t)) return true;
  if (/^\d{1,3}$/.test(t)) return true; // pure number, e.g. "2"
  if (/^[a-z]$/.test(t)) return true; // single letter, e.g. "A"
  return false;
}

function collapseWhitespace(s: string): string {
  return s.trim().replace(/\s+/g, " ");
}

/**
 * Derive the main-team display name for a raw team name.
 * Pure & deterministic. Preserves the original casing of the kept tokens.
 */
export function canonicalTeamName(rawName: string): string {
  const name = collapseWhitespace(rawName ?? "");
  if (name.length === 0) return name;

  // 1. Explicit override wins.
  const override = TEAM_NAME_OVERRIDES[name.toLowerCase()];
  if (override) return override;

  // 2. Heuristic: peel trailing suffix tokens, but never reduce below the
  //    first token (a single-word team name is always kept whole).
  const tokens = name.split(" ");
  while (tokens.length > 1 && isSuffixToken(tokens[tokens.length - 1])) {
    tokens.pop();
  }
  return tokens.join(" ");
}

/** Grouping key: case-insensitive canonical name. */
export function teamGroupKey(rawName: string): string {
  return canonicalTeamName(rawName).toLowerCase();
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

export type TeamGroupSeasonBadge = {
  leagueName: string;
  leagueSlug: string;
  seasonName: string;
  seasonYear: number;
};

export type TeamGroupDriver = {
  userId: string;
  name: string;
  countryCode: string | null;
  iracingMemberId: string | null;
  startNumber: string | null;
  badges: TeamGroupSeasonBadge[];
};

export type TeamGroup = {
  key: string;
  name: string;
  logoUrl: string | null;
  driverCount: number;
  seasonCount: number;
  leagueNames: string[];
  drivers: TeamGroupDriver[];
};

// Minimal shapes the aggregator needs — keeps it decoupled from Prisma types
// so it can be unit-tested with plain objects.
export type AggTeamInput = {
  name: string;
  logoUrl: string | null;
  season: {
    name: string;
    year: number;
    league: { name: string; slug: string };
  };
  registrations: {
    startNumber: string | null;
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
      iracingMemberId: string | null;
    };
  }[];
};

function driverName(u: AggTeamInput["registrations"][number]["user"]): string {
  const n = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return n.length > 0 ? n : "Unknown driver";
}

/**
 * Collapse a flat list of per-season teams into main-team groups, each with a
 * de-duplicated driver list (a driver who appears in several subteams/seasons
 * shows once, with a badge per season they raced under this main team).
 */
export function groupTeamsAcrossSeasons(teams: AggTeamInput[]): TeamGroup[] {
  type Wip = Omit<TeamGroup, "driverCount" | "seasonCount" | "leagueNames"> & {
    driverMap: Map<string, TeamGroupDriver>;
    seasonKeys: Set<string>;
    leagueSet: Set<string>;
  };
  const groups = new Map<string, Wip>();

  for (const team of teams) {
    const key = teamGroupKey(team.name);
    if (key.length === 0) continue;
    let g = groups.get(key);
    if (!g) {
      g = {
        key,
        name: canonicalTeamName(team.name),
        logoUrl: null,
        drivers: [],
        driverMap: new Map(),
        seasonKeys: new Set(),
        leagueSet: new Set(),
      };
      groups.set(key, g);
    }
    if (!g.logoUrl && team.logoUrl) g.logoUrl = team.logoUrl;

    const badge: TeamGroupSeasonBadge = {
      leagueName: team.season.league.name,
      leagueSlug: team.season.league.slug,
      seasonName: team.season.name,
      seasonYear: team.season.year,
    };
    g.seasonKeys.add(
      `${badge.leagueSlug}|${badge.seasonName}|${badge.seasonYear}`
    );
    g.leagueSet.add(badge.leagueName);

    for (const reg of team.registrations) {
      const u = reg.user;
      let d = g.driverMap.get(u.id);
      if (!d) {
        d = {
          userId: u.id,
          name: driverName(u),
          countryCode: u.countryCode,
          iracingMemberId: u.iracingMemberId,
          startNumber: reg.startNumber ?? null,
          badges: [],
        };
        g.driverMap.set(u.id, d);
      }
      // Prefer the most-recent (later year) start number if present.
      if (reg.startNumber) d.startNumber = reg.startNumber;
      const exists = d.badges.some(
        (b) =>
          b.leagueSlug === badge.leagueSlug &&
          b.seasonName === badge.seasonName &&
          b.seasonYear === badge.seasonYear
      );
      if (!exists) d.badges.push(badge);
    }
  }

  const out: TeamGroup[] = [];
  for (const g of groups.values()) {
    const drivers = [...g.driverMap.values()].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    for (const d of drivers) {
      d.badges.sort(
        (a, b) =>
          b.seasonYear - a.seasonYear ||
          a.leagueName.localeCompare(b.leagueName)
      );
    }
    out.push({
      key: g.key,
      name: g.name,
      logoUrl: g.logoUrl,
      driverCount: drivers.length,
      seasonCount: g.seasonKeys.size,
      leagueNames: [...g.leagueSet].sort(),
      drivers,
    });
  }
  // Most drivers first, then alphabetical.
  out.sort(
    (a, b) => b.driverCount - a.driverCount || a.name.localeCompare(b.name)
  );
  return out;
}
