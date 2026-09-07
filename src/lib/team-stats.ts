import "server-only";

import { prisma } from "@/lib/prisma";
import { canonicalTeamName, teamGroupSlug } from "@/lib/team-grouping";
import { driverHistoryKey } from "@/lib/debrief-server";

/**
 * The team's own performance statistic — every race, every driver.
 *
 * This is the CLS version of the workbook Johann Solowej has been keeping by
 * hand for CAS-Tech Endurance: one row per driver per race, and the season
 * trend that comes out of it. It reads the frozen `DebriefMetric` rows, so it
 * shows exactly what the de-briefings said at the time and cannot be quietly
 * redrawn by an edit to an old plan.
 *
 * Scope is the team GROUP, not the per-season Team row: Black and Red are one
 * squad to everybody driving in them, and a statistic that reset every season
 * would answer no question anybody has.
 */

export type TeamStatsRace = {
  sourceKey: string;
  label: string;
  track: string | null;
  car: string | null;
  racedAt: Date;
  /** "cls" = measured in this app, "import" = from the team's own sheet. */
  source: string;
  /** The entry name, when the race was run under one ("… Black"). */
  teamName: string | null;
};

export type TeamStatsCell = {
  relPerf: number | null;
  perf10k: number | null;
  consistency: number | null;
  incPerHour: number | null;
  bestSec: number | null;
  avgCleanSec: number | null;
  planSec: number | null;
  laps: number | null;
  stints: number | null;
  incidents: number | null;
  iRating: number | null;
  source: string;
};

export type TeamStatsDriver = {
  name: string;
  key: string;
  /** One entry per race in `races`, null where the driver did not start. */
  cells: (TeamStatsCell | null)[];
  // --- career totals over the races that carry the figure ----------------
  races: number;
  laps: number;
  incidents: number | null;
  driveSec: number;
  bestSec: number | null;
  /** Unweighted mean over the races where the metric exists. */
  avgRelPerf: number | null;
  avgConsistency: number | null;
  avgIncPerHour: number | null;
  /** The most recent iRating seen for this driver. */
  iRating: number | null;
};

export type TeamStats = {
  group: string;
  groupName: string;
  slug: string;
  races: TeamStatsRace[];
  drivers: TeamStatsDriver[];
};

const secOf = (ms: number | null): number | null =>
  ms == null ? null : ms / 1000;
const fracOf = (ppm: number | null): number | null =>
  ppm == null ? null : ppm / 1_000_000;

function mean(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

/** Every team group that has at least one measured race, for the index. */
export async function teamGroupsWithStats(): Promise<
  { group: string; name: string; slug: string; races: number; drivers: number }[]
> {
  const rows = await prisma.debriefMetric.findMany({
    where: { teamGroup: { not: null } },
    select: { teamGroup: true, sourceKey: true, driverKey: true, teamName: true },
  });
  const byGroup = new Map<
    string,
    { races: Set<string>; drivers: Set<string>; name: string }
  >();
  for (const r of rows) {
    const g = r.teamGroup!;
    const e =
      byGroup.get(g) ??
      { races: new Set<string>(), drivers: new Set<string>(), name: canonicalTeamName(r.teamName ?? g) };
    e.races.add(r.sourceKey);
    e.drivers.add(r.driverKey);
    byGroup.set(g, e);
  }
  return Array.from(byGroup.entries())
    .map(([group, e]) => ({
      group,
      name: e.name,
      slug: teamGroupSlug(group),
      races: e.races.size,
      drivers: e.drivers.size,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Resolve a URL slug back to the group key it came from. */
export async function groupFromSlug(slug: string): Promise<string | null> {
  const groups = await prisma.debriefMetric.findMany({
    where: { teamGroup: { not: null } },
    select: { teamGroup: true },
    distinct: ["teamGroup"],
  });
  const hit = groups.find((g) => teamGroupSlug(g.teamGroup!) === slug);
  return hit?.teamGroup ?? null;
}

export async function teamStats(group: string): Promise<TeamStats> {
  const rows = await prisma.debriefMetric.findMany({
    where: { teamGroup: group },
    orderBy: [{ racedAt: "asc" }, { sourceKey: "asc" }],
  });

  const races: TeamStatsRace[] = [];
  for (const r of rows) {
    if (races.some((x) => x.sourceKey === r.sourceKey)) continue;
    races.push({
      sourceKey: r.sourceKey,
      label: r.raceTitle || r.track || "Rennen",
      track: r.track,
      car: r.car,
      racedAt: r.racedAt,
      source: r.source,
      teamName: r.teamName,
    });
  }

  const keys: string[] = [];
  for (const r of rows) if (!keys.includes(r.driverKey)) keys.push(r.driverKey);

  const drivers: TeamStatsDriver[] = keys
    .map((key) => {
      const mine = rows.filter((r) => r.driverKey === key);
      // The most recent spelling wins — people fix their display name.
      const name = mine[mine.length - 1]?.driverName ?? key;
      const cells = races.map<TeamStatsCell | null>((race) => {
        const hit = mine.find((r) => r.sourceKey === race.sourceKey);
        if (!hit) return null;
        const driveH =
          hit.driveSec != null && hit.driveSec > 0 ? hit.driveSec / 3600 : null;
        return {
          relPerf: fracOf(hit.relPerfPpm),
          perf10k: fracOf(hit.perf10kPpm),
          consistency: fracOf(hit.consistencyPpm),
          // The stored ratio first: an imported race has only that, and a
          // computed one stored the same number it showed at the time.
          incPerHour:
            fracOf(hit.incPerHourPpm) ??
            (hit.incidents != null && driveH != null
              ? hit.incidents / driveH
              : null),
          bestSec: secOf(hit.bestMs),
          avgCleanSec: secOf(hit.avgCleanMs),
          planSec: secOf(hit.planMs),
          laps: hit.laps,
          stints: hit.stints,
          incidents: hit.incidents,
          iRating: hit.iRating,
          source: hit.source,
        };
      });
      const seen = cells.filter((c): c is TeamStatsCell => c != null);
      const bests = seen
        .map((c) => c.bestSec)
        .filter((x): x is number => x != null);
      const incs = seen
        .map((c) => c.incidents)
        .filter((x): x is number => x != null);
      const iRatings = mine
        .map((r) => r.iRating)
        .filter((x): x is number => x != null);
      return {
        name,
        key,
        cells,
        races: seen.length,
        laps: seen.reduce((a, c) => a + (c.laps ?? 0), 0),
        incidents: incs.length ? incs.reduce((a, b) => a + b, 0) : null,
        driveSec: mine.reduce((a, r) => a + (r.driveSec ?? 0), 0),
        bestSec: bests.length ? Math.min(...bests) : null,
        avgRelPerf: mean(seen.map((c) => c.relPerf ?? c.perf10k)),
        avgConsistency: mean(seen.map((c) => c.consistency)),
        avgIncPerHour: mean(seen.map((c) => c.incPerHour)),
        iRating: iRatings.length ? iRatings[iRatings.length - 1] : null,
      };
    })
    .sort((a, b) => b.races - a.races || a.name.localeCompare(b.name));

  return {
    group,
    groupName: canonicalTeamName(rows[0]?.teamName ?? group),
    slug: teamGroupSlug(group),
    races,
    drivers,
  };
}

/**
 * May this person see the team's statistic?
 *
 * Admins, and anybody with an approved registration in a team belonging to
 * this group — which is exactly "the drivers in the team", across seasons and
 * subteams. A driver who has left keeps access to the seasons they raced, on
 * purpose: their own numbers are in there.
 */
export async function canSeeTeamStats(
  group: string,
  viewer: { userId: string; isAdmin: boolean } | null
): Promise<boolean> {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  const regs = await prisma.registration.findMany({
    where: { userId: viewer.userId, status: "APPROVED", teamId: { not: null } },
    select: { team: { select: { name: true } } },
  });
  return regs.some(
    (r) => r.team?.name && teamGroupSlug(r.team.name) === teamGroupSlug(group)
  );
}

// ---------------------------------------------------------------------------
// One driver, in detail
// ---------------------------------------------------------------------------

export type DriverRaceRow = {
  sourceKey: string;
  raceTitle: string;
  track: string | null;
  car: string | null;
  racedAt: Date;
  source: string;
  iRating: number | null;
  avgAllSec: number | null;
  avgCleanSec: number | null;
  planSec: number | null;
  bestSec: number | null;
  refIRatingSec: number | null;
  relPerf: number | null;
  perf10k: number | null;
  consistency: number | null;
  incPerHour: number | null;
  laps: number | null;
  stints: number | null;
  driveSec: number | null;
  incidents: number | null;
  /** Practice pace from the plan's Garage 61 import, when it had one. */
  g61MedianSec: number | null;
  g61BestSec: number | null;
  g61Laps: number | null;
};

export type DriverStintRow = {
  sourceKey: string;
  raceTitle: string;
  racedAt: Date;
  stintIndex: number;
  /** How many-th stint of the race THIS DRIVER's was — 1 = their first. */
  ownIndex: number;
  laps: number | null;
  avgSec: number | null;
  bestSec: number | null;
  planSec: number | null;
  deltaSec: number | null;
  pitSec: number | null;
  incidents: number | null;
  startHour: number | null;
};

/** Where the driver stands among their team mates on one metric. */
export type DriverRank = {
  metric: "relPerf" | "consistency" | "incPerHour" | "bestGapToTeam";
  label: string;
  /** 1 = best in the team. */
  rank: number;
  of: number;
  value: number | null;
  /** The team's mean, so a rank is not read without its spread. */
  teamMean: number | null;
  higherIsBetter: boolean;
};

export type DriverStats = {
  name: string;
  key: string;
  group: string;
  groupName: string;
  slug: string;
  /** iRacing customer id, when CLS knows this person — links the career page. */
  iracingMemberId: string | null;
  races: DriverRaceRow[];
  stints: DriverStintRow[];
  ranks: DriverRank[];
  totals: {
    races: number;
    laps: number;
    driveSec: number;
    incidents: number | null;
    bestSec: number | null;
    avgRelPerf: number | null;
    avgConsistency: number | null;
    avgIncPerHour: number | null;
    iRatingFirst: number | null;
    iRatingLast: number | null;
  };
};

/**
 * Everything the history holds about one driver in one team.
 *
 * The ranks are computed against the team mates who have the same metric, not
 * against the whole roster: a rank out of three when nine drove is a different
 * statement, and the count is carried so the page can say which it is.
 */
export async function driverStats(
  group: string,
  driverKey: string
): Promise<DriverStats | null> {
  const rows = await prisma.debriefMetric.findMany({
    where: { teamGroup: group },
    orderBy: [{ racedAt: "asc" }, { sourceKey: "asc" }],
  });
  const mine = rows.filter((r) => r.driverKey === driverKey);
  if (mine.length === 0) return null;

  const name = mine[mine.length - 1].driverName;

  const races: DriverRaceRow[] = mine.map((r) => ({
    sourceKey: r.sourceKey,
    raceTitle: r.raceTitle,
    track: r.track,
    car: r.car,
    racedAt: r.racedAt,
    source: r.source,
    iRating: r.iRating,
    avgAllSec: secOf(r.avgAllMs),
    avgCleanSec: secOf(r.avgCleanMs),
    planSec: secOf(r.planMs),
    bestSec: secOf(r.bestMs),
    refIRatingSec: secOf(r.refIRatingMs),
    relPerf: fracOf(r.relPerfPpm),
    perf10k: fracOf(r.perf10kPpm),
    consistency: fracOf(r.consistencyPpm),
    incPerHour:
      fracOf(r.incPerHourPpm) ??
      (r.incidents != null && r.driveSec != null && r.driveSec > 0
        ? r.incidents / (r.driveSec / 3600)
        : null),
    laps: r.laps,
    stints: r.stints,
    driveSec: r.driveSec,
    incidents: r.incidents,
    g61MedianSec: secOf(r.g61MedianMs),
    g61BestSec: secOf(r.g61BestMs),
    g61Laps: r.g61Laps,
  }));

  // ---- stints ------------------------------------------------------------
  const stintRows = await prisma.debriefStintMetric.findMany({
    where: { teamGroup: group, driverKey },
    orderBy: [{ racedAt: "asc" }, { stintIndex: "asc" }],
  });
  const seenPerRace = new Map<string, number>();
  const stints: DriverStintRow[] = stintRows.map((st) => {
    const n = (seenPerRace.get(st.sourceKey) ?? 0) + 1;
    seenPerRace.set(st.sourceKey, n);
    return {
      sourceKey: st.sourceKey,
      raceTitle: st.raceTitle,
      racedAt: st.racedAt,
      stintIndex: st.stintIndex,
      ownIndex: n,
      laps: st.laps,
      avgSec: secOf(st.avgMs),
      bestSec: secOf(st.bestMs),
      planSec: secOf(st.planMs),
      deltaSec: secOf(st.deltaMs),
      pitSec: secOf(st.pitMs),
      incidents: st.incidents,
      startHour: st.startHour,
    };
  });

  // ---- rank in the team --------------------------------------------------
  const perDriver = new Map<string, typeof rows>();
  for (const r of rows) {
    const arr = perDriver.get(r.driverKey) ?? [];
    arr.push(r);
    perDriver.set(r.driverKey, arr);
  }
  const meanOf = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null && Number.isFinite(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };

  function rankOn(
    metric: DriverRank["metric"],
    label: string,
    pick: (rs: typeof rows) => number | null,
    higherIsBetter: boolean
  ): DriverRank | null {
    const scored: { key: string; v: number }[] = [];
    for (const [k, rs] of perDriver) {
      const v = pick(rs);
      if (v != null && Number.isFinite(v)) scored.push({ key: k, v });
    }
    if (scored.length === 0) return null;
    scored.sort((a, b) => (higherIsBetter ? b.v - a.v : a.v - b.v));
    const i = scored.findIndex((x) => x.key === driverKey);
    if (i < 0) return null;
    return {
      metric,
      label,
      rank: i + 1,
      of: scored.length,
      value: scored[i].v,
      teamMean: meanOf(scored.map((x) => x.v)),
      higherIsBetter,
    };
  }

  const teamBest = (() => {
    const xs = rows.map((r) => r.bestMs).filter((x): x is number => x != null);
    return xs.length ? Math.min(...xs) : null;
  })();

  const ranks = [
    rankOn(
      "relPerf",
      "Relativperformance",
      (rs) => meanOf(rs.map((r) => fracOf(r.relPerfPpm) ?? fracOf(r.perf10kPpm))),
      true
    ),
    rankOn(
      "consistency",
      "Konstanz",
      (rs) => meanOf(rs.map((r) => fracOf(r.consistencyPpm))),
      true
    ),
    rankOn(
      "incPerHour",
      "Incidents pro Stunde",
      (rs) => meanOf(rs.map((r) => fracOf(r.incPerHourPpm))),
      false
    ),
    // Gap to the team's fastest lap, in seconds — pace in plain terms, next to
    // the ratio-based metrics that hide how much time it actually is.
    rankOn(
      "bestGapToTeam",
      "Abstand zur schnellsten Teamrunde",
      (rs) => {
        const xs = rs.map((r) => r.bestMs).filter((x): x is number => x != null);
        if (!xs.length || teamBest == null) return null;
        return (Math.min(...xs) - teamBest) / 1000;
      },
      false
    ),
  ].filter((r): r is DriverRank => r != null);

  const iRatings = mine
    .map((r) => r.iRating)
    .filter((x): x is number => x != null);
  const incs = mine.map((r) => r.incidents).filter((x): x is number => x != null);
  const bests = mine.map((r) => r.bestMs).filter((x): x is number => x != null);

  return {
    name,
    key: driverKey,
    group,
    groupName: canonicalTeamName(rows[0]?.teamName ?? group),
    slug: teamGroupSlug(group),
    iracingMemberId: null,
    races,
    stints,
    ranks,
    totals: {
      races: mine.length,
      laps: mine.reduce((a, r) => a + (r.laps ?? 0), 0),
      driveSec: mine.reduce((a, r) => a + (r.driveSec ?? 0), 0),
      incidents: incs.length ? incs.reduce((a, b) => a + b, 0) : null,
      bestSec: bests.length ? Math.min(...bests) / 1000 : null,
      avgRelPerf: meanOf(races.map((r) => r.relPerf ?? r.perf10k)),
      avgConsistency: meanOf(races.map((r) => r.consistency)),
      avgIncPerHour: meanOf(races.map((r) => r.incPerHour)),
      iRatingFirst: iRatings.length ? iRatings[0] : null,
      iRatingLast: iRatings.length ? iRatings[iRatings.length - 1] : null,
    },
  };
}

/**
 * The iRacing customer id for a driver name, so the detail page can link the
 * public career page. Matched on the same folded name the history is keyed by;
 * a driver CLS has never seen simply gets no link.
 */
export async function iracingIdForDriver(
  driverKey: string
): Promise<string | null> {
  const users = await prisma.user.findMany({
    where: { iracingMemberId: { not: null } },
    select: { firstName: true, lastName: true, iracingMemberId: true },
  });
  const hit = users.find(
    (u) =>
      driverHistoryKey(`${u.firstName ?? ""} ${u.lastName ?? ""}`) === driverKey
  );
  return hit?.iracingMemberId ?? null;
}
