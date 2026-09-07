import "server-only";

import { prisma } from "@/lib/prisma";
import { canonicalTeamName, teamGroupKey } from "@/lib/team-grouping";
import type { PlannerState } from "@/lib/stint-plan-state";

/**
 * Which team did this stint plan race for?
 *
 * A stint plan is usually made for an iRacing special, which is not a CLS
 * round and therefore has no team of its own. But the people in it are CLS
 * drivers, and CLS knows which team each of them is registered with — so the
 * team can be inferred, and only has to be corrected when the inference is
 * wrong (a guest line-up, or a driver registered with two teams).
 *
 * Grouped, not per-season: the statistic spans seasons and subteams, and
 * "CAS-Tech Endurance Black" and "…Red" are one squad to everyone driving in
 * them. `teamGroup` is the key `src/lib/team-grouping.ts` already uses for the
 * public Teams overview, so the two can never disagree about what a team is.
 */

export type PlanTeam = {
  /** Grouping key, e.g. "cas-tech endurance". Null when nothing matched. */
  teamGroup: string | null;
  /** Display name of the group, e.g. "CAS-Tech Endurance". */
  teamGroupName: string | null;
  /** The concrete entry, e.g. "CAS-Tech Endurance Black", when known. */
  teamName: string | null;
  /** True when this came from the drivers rather than from a hand correction. */
  inferred: boolean;
  /** How many of the plan's drivers pointed at this team — the confidence. */
  votes: number;
  /** How many drivers were matched to any team at all. */
  matched: number;
};

const EMPTY: PlanTeam = {
  teamGroup: null,
  teamGroupName: null,
  teamName: null,
  inferred: true,
  votes: 0,
  matched: 0,
};

/**
 * The plan's driver ids that are real CLS users.
 *
 * `payload.drivers[].id` IS a CLS User.id for anyone picked from the CLS
 * driver picker; a row typed by hand carries a generated id that matches
 * nobody, which is exactly what we want — it simply does not vote.
 */
function driverUserIds(state: PlannerState): string[] {
  return state.drivers.map((d) => d.id).filter((id) => typeof id === "string" && id.length > 0);
}

export async function resolvePlanTeam(
  plan: { teamId: string | null },
  state: PlannerState
): Promise<PlanTeam> {
  // 1. A hand correction beats every inference.
  if (plan.teamId) {
    const team = await prisma.team.findUnique({
      where: { id: plan.teamId },
      select: { name: true },
    });
    if (team) {
      return {
        teamGroup: teamGroupKey(team.name),
        teamGroupName: canonicalTeamName(team.name),
        teamName: team.name,
        inferred: false,
        votes: 0,
        matched: 0,
      };
    }
    // A team that has since been deleted must not silently keep the plan
    // pointing at nothing — fall through and infer again.
  }

  // 2. Infer from the line-up.
  const ids = driverUserIds(state);
  if (ids.length === 0) return EMPTY;

  const regs = await prisma.registration.findMany({
    where: {
      userId: { in: ids },
      status: "APPROVED",
      teamId: { not: null },
    },
    select: {
      userId: true,
      team: { select: { name: true } },
      season: { select: { year: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  if (regs.length === 0) return EMPTY;

  // One vote per DRIVER, not per registration — someone with four seasons in
  // the same team must not outvote three team mates.
  const perDriver = new Map<string, Map<string, { name: string; year: number }>>();
  for (const r of regs) {
    if (!r.team?.name) continue;
    const key = teamGroupKey(r.team.name);
    if (!key) continue;
    const mine = perDriver.get(r.userId) ?? new Map();
    // Keep the most recent season's entry name for this group.
    const prev = mine.get(key);
    const year = r.season?.year ?? 0;
    if (!prev || year >= prev.year) mine.set(key, { name: r.team.name, year });
    perDriver.set(r.userId, mine);
  }

  const votes = new Map<string, { n: number; name: string; year: number }>();
  for (const mine of perDriver.values()) {
    for (const [key, v] of mine) {
      const cur = votes.get(key) ?? { n: 0, name: v.name, year: v.year };
      cur.n += 1;
      if (v.year >= cur.year) {
        cur.name = v.name;
        cur.year = v.year;
      }
      votes.set(key, cur);
    }
  }
  if (votes.size === 0) return EMPTY;

  let bestKey = "";
  let best = { n: -1, name: "", year: 0 };
  for (const [key, v] of votes) {
    if (v.n > best.n) {
      bestKey = key;
      best = v;
    }
  }

  return {
    teamGroup: bestKey,
    teamGroupName: canonicalTeamName(best.name),
    // The entry name is only meaningful when everyone agreed on one team;
    // otherwise the plan is a mixed line-up and naming one car would mislead.
    teamName: best.n === perDriver.size ? best.name : null,
    inferred: true,
    votes: best.n,
    matched: perDriver.size,
  };
}

/** Every team a plan could be corrected to, for the picker. */
export async function teamPickerOptions(): Promise<
  { id: string; name: string; label: string }[]
> {
  const teams = await prisma.team.findMany({
    where: { season: { league: { isArchived: false } } },
    select: {
      id: true,
      name: true,
      season: {
        select: { name: true, year: true, league: { select: { name: true } } },
      },
    },
    orderBy: [{ name: "asc" }],
  });
  return teams.map((t) => ({
    id: t.id,
    name: t.name,
    label: `${t.name} — ${t.season.league.name} ${t.season.name} ${t.season.year}`,
  }));
}
