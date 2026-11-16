/**
 * Hall of Fame (all leagues, all seasons).
 *
 * Two sources, one shape:
 *  - CLS seasons with status COMPLETED (archived ones included: history),
 *    podiums computed with the same standings engine and ordering as the
 *    public standings page;
 *  - the seasons before CLS from the static iRLM snapshot
 *    (`hall-of-fame-legacy.ts`).
 *
 * Drivers are matched across both by iRacing id (User.iracingMemberId), else
 * by name, so titles from the iRLM era and the CLS era add up.
 *
 * Computing every completed season is slow (one standings run each), so the
 * result is cached for an hour; a new champion shows up at the latest then.
 */
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  computeDriverStandings,
  computeTeamClassStandings,
  computeTeamStandings,
  type DriverStanding,
} from "@/lib/standings";
import { leagueHasTeamCompetition } from "@/lib/team-visibility";
import { HOF_LEGACY, type HofEntry, type HofStanding } from "@/lib/hall-of-fame-legacy";

export type { HofEntry, HofStanding };

export type HofSeason = {
  leagueSlug: string;
  seasonName: string;
  /** YYYY-MM-DD of the last race. */
  endedOn: string;
  source: "CLS" | "iRLM";
  /** Standings page, CLS seasons only. */
  href: string | null;
  standings: HofStanding[];
};

export type HofLeague = { slug: string; name: string; logoUrl: string | null; seasons: HofSeason[] };

export type HofDriverTally = {
  key: string;
  name: string;
  titles: number;
  classTitles: number;
  podiums: number;
  /** League slugs of the overall titles, one per title. */
  titleLeagues: string[];
};

export type HofTeamTally = { key: string; name: string; titles: number; leagues: string[] };

export type HallOfFame = {
  leagues: HofLeague[];
  drivers: HofDriverTally[];
  teams: HofTeamTally[];
  seasonCount: number;
};

/** Display order of the leagues; unknown ones go last, alphabetically. */
const LEAGUE_ORDER = [
  "cas-gt3-wct",
  "cas-iec",
  "cas-combined-cup",
  "cas-sfl-cup",
  "cas-pccd",
  "cas-tss-gt4",
  "nascar-cas-cup",
  "cas-fun-league",
];

const sortByCombined = (a: DriverStanding, b: DriverStanding) =>
  Number(b.roundsCompleted > 0) - Number(a.roundsCompleted > 0) ||
  b.combinedTotal - a.combinedTotal ||
  a.totalIncidents - b.totalIncidents ||
  b.rawPoints - a.rawPoints ||
  (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "");

const sortByClass = (a: DriverStanding, b: DriverStanding) =>
  b.classTotal - a.classTotal ||
  a.totalIncidents - b.totalIncidents ||
  b.classRawPoints - a.classRawPoints ||
  (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "");

const ymd = (d: Date) => d.toISOString().slice(0, 10);

async function clsSeasons(): Promise<HofSeason[]> {
  const seasons = await prisma.season.findMany({
    where: { status: "COMPLETED" },
    select: {
      id: true,
      name: true,
      proAmEnabled: true,
      league: { select: { slug: true } },
      rounds: {
        where: { status: "COMPLETED", countsForChampionship: true },
        select: { startsAt: true },
        orderBy: { startsAt: "desc" },
        take: 1,
      },
    },
  });

  const out: HofSeason[] = [];
  for (const s of seasons) {
    if (s.rounds.length === 0) continue;
    const slug = s.league.slug;
    const [drivers, teamClasses, regs, wins] = await Promise.all([
      computeDriverStandings(prisma, s.id),
      computeTeamClassStandings(prisma, s.id),
      prisma.registration.findMany({
        where: { seasonId: s.id },
        select: { id: true, user: { select: { iracingMemberId: true } } },
      }),
      prisma.raceResult.groupBy({
        by: ["registrationId"],
        where: {
          finishPosition: 1,
          finishStatus: "CLASSIFIED",
          round: { seasonId: s.id, status: "COMPLETED", countsForChampionship: true },
        },
        _count: { _all: true },
      }),
    ]);
    const iracingOf = new Map(regs.map((r) => [r.id, r.user.iracingMemberId ?? null]));
    const winsOf = new Map(wins.map((w) => [w.registrationId, w._count._all]));
    const entry = (d: DriverStanding, pos: number, points: number): HofEntry => ({
      pos,
      name: `${d.driverFirstName ?? ""} ${d.driverLastName ?? ""}`.trim() || "—",
      iracingId: iracingOf.get(d.registrationId) ?? null,
      points,
      wins: winsOf.get(d.registrationId) ?? 0,
    });

    const standings: HofStanding[] = [];
    const isTeamEvent = teamClasses.length > 0;
    const raced = drivers.filter((d) => d.roundsCompleted > 0);
    if (!isTeamEvent && raced.length > 0) {
      standings.push({
        kind: "overall",
        label: "Overall",
        podium: [...raced].sort(sortByCombined).slice(0, 3).map((d, i) => entry(d, i + 1, d.combinedTotal)),
      });
      if (s.proAmEnabled) {
        for (const [cls, label] of [["PRO", "Pro"], ["AM", "Am"]] as const) {
          const rows = raced.filter((d) => d.proAmClass === cls).sort(sortByClass);
          if (rows.length)
            standings.push({
              kind: "class",
              label,
              podium: rows.slice(0, 3).map((d, i) => entry(d, i + 1, d.classTotal)),
            });
        }
      }
    }
    if (isTeamEvent) {
      for (const g of teamClasses) {
        const teams = [...g.teams].sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 3);
        if (teams.length)
          standings.push({
            kind: "team",
            label: g.carClassName,
            podium: teams.map((t, i) => ({ pos: i + 1, name: t.teamName, iracingId: null, points: t.totalPoints, wins: 0 })),
          });
      }
    } else if (leagueHasTeamCompetition(slug)) {
      const teams = (await computeTeamStandings(prisma, s.id))
        .filter((t) => t.totalPoints > 0)
        .sort((a, b) => b.totalPoints - a.totalPoints)
        .slice(0, 3);
      if (teams.length)
        standings.push({
          kind: "team",
          label: "Teams",
          podium: teams.map((t, i) => ({ pos: i + 1, name: t.teamName, iracingId: null, points: t.totalPoints, wins: 0 })),
        });
    }
    if (standings.length === 0) continue;
    out.push({
      leagueSlug: slug,
      seasonName: s.name,
      endedOn: ymd(s.rounds[0].startsAt),
      source: "CLS",
      href: `/leagues/${slug}/seasons/${s.id}/standings`,
      standings,
    });
  }
  return out;
}

const nameKey = (n: string) =>
  n
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function buildHallOfFame(): Promise<HallOfFame> {
  const [leagueRows, cls] = await Promise.all([
    prisma.league.findMany({ select: { slug: true, name: true, logoUrl: true } }),
    clsSeasons(),
  ]);
  const all: HofSeason[] = [
    ...HOF_LEGACY.map((s) => ({ ...s, href: null })),
    ...cls,
  ].sort((a, b) => b.endedOn.localeCompare(a.endedOn));

  const leagues = new Map<string, HofLeague>();
  for (const s of all) {
    let l = leagues.get(s.leagueSlug);
    if (!l) {
      const row = leagueRows.find((r) => r.slug === s.leagueSlug);
      l = { slug: s.leagueSlug, name: row?.name ?? s.leagueSlug, logoUrl: row?.logoUrl ?? null, seasons: [] };
      leagues.set(s.leagueSlug, l);
    }
    l.seasons.push(s);
  }
  const rank = (slug: string) => {
    const i = LEAGUE_ORDER.indexOf(slug);
    return i < 0 ? LEAGUE_ORDER.length : i;
  };

  // Tallies. Name per iRacing id: the most recent spelling wins (all is
  // newest first, so the first one seen).
  const keyOfName = new Map<string, string>(); // nameKey -> key, so a name-only entry joins an id-keyed one
  const drivers = new Map<string, HofDriverTally>();
  const driver = (e: HofEntry) => {
    const nk = nameKey(e.name);
    let key = e.iracingId ? `ir:${e.iracingId}` : keyOfName.get(nk) ?? `n:${nk}`;
    if (e.iracingId && !keyOfName.has(nk)) keyOfName.set(nk, key);
    if (!e.iracingId && keyOfName.has(nk)) key = keyOfName.get(nk)!;
    let t = drivers.get(key);
    if (!t) {
      t = { key, name: e.name, titles: 0, classTitles: 0, podiums: 0, titleLeagues: [] };
      drivers.set(key, t);
    }
    return t;
  };
  // First pass registers the id-keyed names so name-only entries can join.
  for (const s of all) for (const st of s.standings) for (const e of st.podium) if (st.kind !== "team" && e.iracingId) driver(e);
  const teams = new Map<string, HofTeamTally>();
  for (const s of all) {
    for (const st of s.standings) {
      if (st.kind === "team") {
        const champ = st.podium.find((e) => e.pos === 1);
        if (!champ) continue;
        const k = nameKey(champ.name);
        const t = teams.get(k) ?? { key: k, name: champ.name, titles: 0, leagues: [] };
        t.titles++;
        t.leagues.push(s.leagueSlug);
        teams.set(k, t);
        continue;
      }
      for (const e of st.podium) {
        const t = driver(e);
        if (st.kind === "overall") {
          t.podiums++;
          if (e.pos === 1) {
            t.titles++;
            t.titleLeagues.push(s.leagueSlug);
          }
        } else if (e.pos === 1) {
          t.classTitles++;
        }
      }
    }
  }

  return {
    leagues: [...leagues.values()].sort((a, b) => rank(a.slug) - rank(b.slug) || a.name.localeCompare(b.name)),
    drivers: [...drivers.values()]
      .filter((d) => d.titles + d.classTitles + d.podiums > 0)
      .sort(
        (a, b) =>
          b.titles - a.titles || b.classTitles - a.classTitles || b.podiums - a.podiums || a.name.localeCompare(b.name),
      ),
    teams: [...teams.values()].sort((a, b) => b.titles - a.titles || a.name.localeCompare(b.name)),
    seasonCount: all.length,
  };
}

export const getHallOfFame = unstable_cache(buildHallOfFame, ["hall-of-fame-v1"], { revalidate: 3600 });
