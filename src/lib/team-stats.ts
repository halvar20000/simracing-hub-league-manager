import "server-only";

import { prisma } from "@/lib/prisma";
import { canonicalTeamName, teamGroupSlug } from "@/lib/team-grouping";

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
