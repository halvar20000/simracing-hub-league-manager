import { prisma } from "@/lib/prisma";

/**
 * Write side of team membership on team-mode seasons (IEC) — see
 * src/lib/team-members.ts for the model. Not "use server": imported by the
 * registration actions and admin actions alike.
 *
 * Until 2026-10-11 entering a driver with a team simply upserted his one
 * Registration with the new teamId — silently MOVING him out of the team he
 * was already in (that is how the IEC Jurassic crews ended up crossed). A
 * driver may now be in several teams at once: the first team stays his home
 * team (Registration.teamId), every further one is a TeamMembership row.
 */

type Db = Pick<typeof prisma, "registration" | "teamMembership">;

/**
 * If this driver is already ACTIVELY entered with a DIFFERENT team in the
 * season, record `teamId` as an extra team (with that team's car class) and
 * return true — the caller must then leave the Registration alone. Returns
 * false when the caller should do its normal upsert (no registration yet, a
 * withdrawn/rejected one, a pure team-manager row, no team, or already this
 * team as home team).
 */
export async function enterAsExtraTeamIfElsewhere(
  db: Db,
  input: {
    seasonId: string;
    userId: string;
    teamId: string;
    carClassId: string | null;
  }
): Promise<boolean> {
  const reg = await db.registration.findUnique({
    where: { seasonId_userId: { seasonId: input.seasonId, userId: input.userId } },
    select: { id: true, teamId: true, status: true, isTeamManager: true },
  });
  if (
    !reg ||
    reg.isTeamManager ||
    !reg.teamId ||
    reg.teamId === input.teamId ||
    reg.status === "WITHDRAWN" ||
    reg.status === "REJECTED"
  ) {
    return false;
  }
  await db.teamMembership.upsert({
    where: { teamId_registrationId: { teamId: input.teamId, registrationId: reg.id } },
    update: { carClassId: input.carClassId },
    create: {
      teamId: input.teamId,
      registrationId: reg.id,
      carClassId: input.carClassId,
    },
  });
  return true;
}

/**
 * Take a driver OUT of one team. An extra team just loses its membership row.
 * For the home team: if the driver has extra teams, the oldest one is promoted
 * to home team (with its car class) and the driver stays entered; only a
 * driver with no other team is withdrawn. Returns what happened.
 */
export async function leaveTeam(
  db: Db,
  registrationId: string,
  teamId: string
): Promise<"extra-removed" | "promoted" | "withdrawn" | "not-member"> {
  const reg = await db.registration.findUnique({
    where: { id: registrationId },
    select: {
      teamId: true,
      extraTeams: {
        orderBy: { createdAt: "asc" },
        select: { id: true, teamId: true, carClassId: true },
      },
    },
  });
  if (!reg) return "not-member";
  const extra = reg.extraTeams.find((m) => m.teamId === teamId);
  if (extra) {
    await db.teamMembership.delete({ where: { id: extra.id } });
    return "extra-removed";
  }
  if (reg.teamId !== teamId) return "not-member";
  const next = reg.extraTeams[0];
  if (next) {
    await db.registration.update({
      where: { id: registrationId },
      data: { teamId: next.teamId, carClassId: next.carClassId },
    });
    await db.teamMembership.delete({ where: { id: next.id } });
    return "promoted";
  }
  await db.registration.update({
    where: { id: registrationId },
    data: { status: "WITHDRAWN" },
  });
  return "withdrawn";
}
