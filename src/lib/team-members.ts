import type { Prisma } from "@prisma/client";

/**
 * Team membership on team-mode seasons (IEC).
 *
 * A driver has ONE Registration per season. Its `teamId` is the driver's home
 * team; since 2026-10-11 the driver may additionally be entered with other
 * teams of the same season through TeamMembership rows (each with that team's
 * car class — a driver can sit in an LMP2 and a GT3 team at once). Approval,
 * start number and iRating stay on the Registration.
 *
 * Everything that asks "who is in team X" must go through teamMemberWhere(),
 * and everything that asks "which teams is this driver in" through
 * teamIdsOf(), so the home team and the extra teams never drift apart.
 * Pure (no Prisma client) — safe for server components and actions alike.
 */

/** Registration filter: drivers entered with this team, home or extra. */
export function teamMemberWhere(teamId: string): Prisma.RegistrationWhereInput {
  return { OR: [{ teamId }, { extraTeams: { some: { teamId } } }] };
}

/** Registration filter: drivers entered with ANY of these teams. */
export function anyTeamMemberWhere(
  teamIds: string[]
): Prisma.RegistrationWhereInput {
  return {
    OR: [
      { teamId: { in: teamIds } },
      { extraTeams: { some: { teamId: { in: teamIds } } } },
    ],
  };
}

/** Include fragment for the extra teams of a registration. */
export const extraTeamsInclude = {
  extraTeams: {
    select: {
      teamId: true,
      carClassId: true,
      team: { select: { id: true, name: true } },
    },
  },
} as const;

type RegWithTeams = {
  teamId: string | null;
  extraTeams?: { teamId: string }[];
};

/** Every team the registration is entered with — home team first. */
export function teamIdsOf(reg: RegWithTeams): string[] {
  const ids: string[] = [];
  if (reg.teamId) ids.push(reg.teamId);
  for (const m of reg.extraTeams ?? []) if (!ids.includes(m.teamId)) ids.push(m.teamId);
  return ids;
}

/** True when the registration is entered with this team (home or extra). */
export function isInTeam(reg: RegWithTeams, teamId: string): boolean {
  return teamIdsOf(reg).includes(teamId);
}

/**
 * The car class the driver runs in FOR THIS TEAM: the extra membership's
 * class when the team is an extra one, else the registration's own class.
 */
export function classInTeam(
  reg: {
    teamId: string | null;
    carClassId: string | null;
    extraTeams?: { teamId: string; carClassId: string | null }[];
  },
  teamId: string
): string | null {
  if (reg.teamId === teamId) return reg.carClassId;
  return reg.extraTeams?.find((m) => m.teamId === teamId)?.carClassId ?? reg.carClassId;
}

/**
 * A team's roster for display: its home members plus the drivers entered with
 * it as an extra team, the latter carrying THIS team's car class. Pages load
 * `registrations` and `extraMembers: { include: { registration, carClass } }`
 * with the same filters and merge them here. Each extra row is tagged
 * `isExtraMember: true` so a page can mark it.
 */
export function mergeExtraMembers<
  R extends { id: string; carClassId: string | null },
>(
  registrations: R[],
  extras: { carClassId: string | null; carClass?: unknown; registration: R }[]
): (R & { isExtraMember?: boolean })[] {
  const out: (R & { isExtraMember?: boolean })[] = [...registrations];
  for (const m of extras) {
    if (out.some((r) => r.id === m.registration.id)) continue;
    const row = {
      ...m.registration,
      carClassId: m.carClassId,
      isExtraMember: true,
    } as R & { isExtraMember?: boolean };
    if ("carClass" in m.registration && m.carClass !== undefined) {
      (row as Record<string, unknown>).carClass = m.carClass;
    }
    out.push(row);
  }
  return out;
}
