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
 * Keys must match the raw team name exactly (lower-cased, single spaces),
 * INCLUDING any brackets/hash characters.
 */
export const TEAM_NAME_OVERRIDES: Record<string, string> = {
  // Exact full-name fixes the prefix/heuristic rules below can't express.
  "fmm#1 tak-automation.com": "FMM tak-automation.com",
  "fmm#2 tak-automation.com": "FMM tak-automation.com",
  "prrime eracing": "Prime eRacing", // typo of Prime eRacing
  "team raycing black $iec": "Team RaYcing",
};

/**
 * Prefix rules — if the (lower-cased) raw name equals OR begins with one of
 * these prefixes (on a word/hyphen boundary), it maps to the given main team.
 * This is the main tool for "show the main team only": it merges every
 * subteam variant (colour, number, class, division, sponsor, bracket tag)
 * under one box. Order doesn't matter — the longest matching prefix wins.
 *
 * Add a line here to merge a newly-split team.
 */
export const TEAM_NAME_PREFIXES: Record<string, string> = {
  "jurassic kart racing": "Jurassic Kart Racing",
  "ws racing esports": "WS Racing eSports",
  "dat muss kesseln": "Dat muss Kesseln",
  "alemannia aachen": "Alemannia Aachen",
  "danküchen": "DanKüchen Motorsport",
  "dan küchen": "DanKüchen Motorsport",
  "cas tech performance": "CAS-Tech Performance",
  "cas-tech performance": "CAS-Tech Performance",
  "cas tech endurance": "CAS-Tech Endurance",
  "cas-tech endurance": "CAS-Tech Endurance",
  "neon simsports": "NEON Simsports",
  "neon simsport": "NEON Simsports", // covers the "Simsport" typo
  "atzen motorsport": "Atzen Motorsport",
  "speed monkeys": "Speed Monkeys",
  "melanzani racing": "Melanzani Racing",
  "pure performance esports": "Pure Performance eSports",
  "cbs racing": "CBS Racing",
  "pwa e-sports": "PWA E-Sports",
  "pacemonkey simracing": "PaceMonkey SimRacing",
  "nolimit motorsport": "NoLimit Motorsport",
  "next curve performance": "Next Curve Performance",
  "mt-performance esport": "MT-Performance eSport",
  "teamspirit-simracing": "TeamSpirit-SimRacing",
  "austrian simracers cas endurance": "Austrian Simracers CAS Endurance",
  "duck knife x sundi company": "Duck Knife x Sundi Company",
};

/**
 * Normalise the heuristic OUTPUT to a single canonical spelling/casing.
 * Keyed by the lower-cased post-strip name → final display name. Unifies
 * variants that don't share a word-prefix (e.g. ".de" suffix, casing).
 */
export const CANONICAL_ALIASES: Record<string, string> = {
  "germansimracing.de": "GermanSimRacing",
  "germansimracing": "GermanSimRacing",
  "neon simsports": "NEON Simsports",
};

/**
 * Names that are NOT real teams and should be hidden from the overview.
 * Lower-cased canonical names.
 */
export const EXCLUDED_TEAM_NAMES = new Set<string>([
  "independent",
  "privateer",
  "free agent",
  "no team",
  "none",
]);

/**
 * Main-team logos. Keyed by the GROUP KEY (lower-cased canonical name, i.e.
 * the output of teamGroupKey). Values are image URLs (external or local under
 * /public). Used only as a fallback when no per-team DB logoUrl is set.
 * A missing/blocked image degrades gracefully to initials (the card <img>
 * has an onError fallback).
 *
 * To add a logo: add a line keyed by the team's group key (lower-cased
 * canonical name) → image URL.
 */
export const TEAM_LOGOS: Record<string, string> = {
  // Alemannia Aachen — official club crest (Wikimedia Commons, rendered PNG).
  "alemannia aachen":
    "https://commons.wikimedia.org/wiki/Special:FilePath/Alemannia_Aachen_2010.svg?width=200",
  // WS Racing eSports e.V. — profile logo from wsracing-esports.de.
  "ws racing esports":
    "https://wsracing-esports.de/wp-content/uploads/2020/04/FB-Profil.png",
  // GermanSimRacing (GSR) — site logo.
  "germansimracing":
    "https://www.germansimracing.de/images/style-10/pageLogo-9e88a613.png",
  // Melanzani Racing e.V. — site logo (270×270).
  "melanzani racing":
    "https://melanzani-racing.net/wp-content/uploads/2025/07/cropped-Melli-scaled-1-270x270.png",
  // NEON Simsports — self-hosted (provided by Thomas).
  "neon simsports": "/logos/teams/neon-simsports.jpg",
};

// Suffix tokens that mark a subteam variant. Lower-cased, no punctuation.
const SUFFIX_TOKENS = new Set<string>([
  // English colours
  "red", "blue", "green", "yellow", "black", "white", "orange", "purple",
  "pink", "gold", "silver", "grey", "gray", "cyan", "magenta", "bronze",
  "teal", "violet", "brown", "navy", "lime", "aqua", "maroon", "petrol",
  // German colours
  "rot", "blau", "gruen", "grün", "gelb", "schwarz", "weiss", "weiß",
  "lila", "violett", "gold", "silber", "grau", "tuerkis", "türkis",
  "braun", "rosa",
  // Greek letters used as subteam designators (e.g. "… Delta")
  "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "omega", "sigma",
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

  const lower = name.toLowerCase();

  // 1. Explicit override wins (raw full-name match).
  let base: string | undefined = TEAM_NAME_OVERRIDES[lower];

  // 2. Prefix rule (longest match wins) — merges every subteam variant.
  if (!base) base = matchPrefix(lower);

  // 3. Otherwise heuristic: peel trailing suffix tokens, but never reduce
  //    below the first token (a single-word team name is kept whole).
  if (!base) {
    const tokens = name.split(" ");
    while (tokens.length > 1 && isSuffixToken(tokens[tokens.length - 1])) {
      tokens.pop();
    }
    base = tokens.join(" ");
  }

  // 4. Normalise spelling/casing variants to one canonical display name.
  return CANONICAL_ALIASES[base.toLowerCase()] ?? base;
}

/**
 * Return the main team for a lower-cased raw name if it matches a prefix rule
 * on a word boundary (exact, or followed by a space or hyphen). Longest
 * matching prefix wins so more-specific rules take precedence.
 */
function matchPrefix(lower: string): string | undefined {
  let best: string | undefined;
  let bestLen = -1;
  for (const prefix in TEAM_NAME_PREFIXES) {
    if (prefix.length <= bestLen) continue;
    if (
      lower === prefix ||
      lower.startsWith(prefix + " ") ||
      lower.startsWith(prefix + "-")
    ) {
      best = TEAM_NAME_PREFIXES[prefix];
      bestLen = prefix.length;
    }
  }
  return best;
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
    if (EXCLUDED_TEAM_NAMES.has(key)) continue;
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
      logoUrl: g.logoUrl ?? TEAM_LOGOS[g.key] ?? null,
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
