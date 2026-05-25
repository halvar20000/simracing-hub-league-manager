/**
 * Per-team driver cap.
 *
 * CAS GT3 WCT limits each team to 3 drivers. Other leagues are uncapped.
 * The cap is enforced in three places — all importing this helper:
 *   - the public registration form (src/components/TeamPicker.tsx) hides /
 *     greys out full teams,
 *   - createRegistration re-checks server-side (a crafted POST could bypass
 *     the UI),
 *   - the admin roster edit (updateRegistration) re-checks too — the cap is
 *     a hard limit, admins included.
 *
 * NOTE: not a "use server" module — it is imported by both server actions
 * and server components.
 */

import { prisma } from "@/lib/prisma";

/** GT3 WCT caps each team at 3 drivers. */
export const GT3_WCT_TEAM_LIMIT = 3;

/**
 * The per-team driver cap for a league, or null when the league is uncapped.
 * Hardcoded to GT3 WCT for now (see CLAUDE.md on the slug-based shims).
 */
export function teamSizeLimit(leagueSlug: string): number | null {
  return leagueSlug === "cas-gt3-wct" ? GT3_WCT_TEAM_LIMIT : null;
}

/**
 * Count the drivers occupying a team's slots: registrations that are PENDING
 * or APPROVED and not excluded. WITHDRAWN / REJECTED registrations free their
 * slot. `excludeUserId` drops one driver from the count — pass the driver
 * being (re-)registered so they never block their own slot.
 */
export async function countTeamMembers(
  teamId: string,
  excludeUserId?: string | null
): Promise<number> {
  return prisma.registration.count({
    where: {
      teamId,
      status: { in: ["PENDING", "APPROVED"] },
      excludedAt: null,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}
