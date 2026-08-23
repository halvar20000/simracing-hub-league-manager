import { prisma } from "@/lib/prisma";

/** Just the two ownership columns of a Team row. */
export type TeamOwnershipInput = {
  leaderUserId: string | null;
  managerUserId: string | null;
};

export type TeamOwnership = {
  /** leaderUserId, but only if that User still exists. */
  leaderUserId: string | null;
  /** managerUserId, but only if that User still exists. */
  managerUserId: string | null;
  /** True when a recorded id pointed at a User that is gone. */
  orphaned: boolean;
  /** True when nobody can claim the team through leader/manager any more. */
  ownerless: boolean;
};

/**
 * Resolve who really owns a team.
 *
 * `Team.leaderUserId` / `Team.managerUserId` are plain `String?` columns with
 * no foreign key (see prisma/schema.prisma), so deleting or merging a User
 * leaves the team pointing at an id that no longer resolves. The team is then
 * owned by nobody: the leader can't resubmit the team registration ("This team
 * is already registered. Ask the team leader…") and Manage Team refuses
 * everyone — the team is locked for good with no way back short of a DB edit.
 *
 * Treat a dangling id as unset so callers can fall back to letting an active
 * roster member take the team over.
 */
export async function resolveTeamOwnership(
  team: TeamOwnershipInput
): Promise<TeamOwnership> {
  const ids = [team.leaderUserId, team.managerUserId].filter(
    (id): id is string => !!id
  );
  const alive =
    ids.length === 0
      ? new Set<string>()
      : new Set(
          (
            await prisma.user.findMany({
              where: { id: { in: ids } },
              select: { id: true },
            })
          ).map((u) => u.id)
        );

  const leaderUserId =
    team.leaderUserId && alive.has(team.leaderUserId)
      ? team.leaderUserId
      : null;
  const managerUserId =
    team.managerUserId && alive.has(team.managerUserId)
      ? team.managerUserId
      : null;

  return {
    leaderUserId,
    managerUserId,
    orphaned:
      (!!team.leaderUserId && leaderUserId === null) ||
      (!!team.managerUserId && managerUserId === null),
    ownerless: leaderUserId === null && managerUserId === null,
  };
}

/**
 * Is this user an active (not withdrawn/rejected) member of the team's roster?
 * Used to decide who may adopt an ownerless team.
 */
export async function isActiveTeamMember(
  teamId: string,
  userId: string
): Promise<boolean> {
  const reg = await prisma.registration.findFirst({
    where: {
      teamId,
      userId,
      status: { notIn: ["WITHDRAWN", "REJECTED"] },
    },
    select: { id: true },
  });
  return reg !== null;
}
