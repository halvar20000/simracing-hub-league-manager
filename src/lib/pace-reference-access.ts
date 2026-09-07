import "server-only";

import { prisma } from "@/lib/prisma";
import { getStintPlanViewer } from "@/lib/stint-plan-access";

/**
 * Who may use the pace-reference library.
 *
 * The library is one shared collection, not a per-team one: a curve for GT3 at
 * Spa is the same curve whichever team looks it up, and splitting it per team
 * would mean the same numbers typed in three times. So the gate is membership,
 * not a particular team — anybody with an approved registration in a team, plus
 * admins.
 *
 * Reading and ADDING are open to that audience; changing or deleting an
 * existing curve stays with admins. A curve is pointed at by stint plans and by
 * every de-briefing built from them, so an overwritten entry silently changes
 * analyses that are already published — that is a different kind of act from
 * adding a new row and is gated differently.
 */

export type PaceViewer = {
  userId: string;
  isAdmin: boolean;
  /** True when this person is on at least one team roster. */
  isTeamMember: boolean;
};

export async function getPaceViewer(): Promise<PaceViewer | null> {
  const viewer = await getStintPlanViewer();
  if (!viewer) return null;
  if (viewer.isAdmin)
    return { userId: viewer.userId, isAdmin: true, isTeamMember: true };
  const reg = await prisma.registration.findFirst({
    where: { userId: viewer.userId, status: "APPROVED", teamId: { not: null } },
    select: { id: true },
  });
  return {
    userId: viewer.userId,
    isAdmin: false,
    isTeamMember: reg != null,
  };
}

/** May this person open the library at all? */
export function canUsePaceLibrary(v: PaceViewer | null): boolean {
  return v != null && (v.isAdmin || v.isTeamMember);
}

/** May this person add a NEW curve? Same audience as reading. */
export function canAddPaceReference(v: PaceViewer | null): boolean {
  return canUsePaceLibrary(v);
}

/** May this person overwrite or delete an existing curve? Admins only. */
export function canEditPaceReference(v: PaceViewer | null): boolean {
  return v != null && v.isAdmin;
}
