/**
 * Per-team driver cap.
 *
 * Two sources, in priority order:
 *   1. `Season.teamMaxDrivers` — admin-configurable per-season cap. Used by
 *      IEC (3 = team leader + 2 teammates) and by any future season that
 *      wants a custom cap. Set from the season edit page.
 *   2. `GT3_WCT_TEAM_LIMIT` slug-shim — historical cap for cas-gt3-wct, kept
 *      so existing GT3 WCT seasons (where `teamMaxDrivers` was never set)
 *      don't suddenly become uncapped mid-season. Once every GT3 WCT season
 *      carries an explicit `teamMaxDrivers`, this shim can be deleted.
 *
 * The cap is enforced in four places — all importing this helper:
 *   - the public solo registration form (src/components/TeamPicker.tsx,
 *     used by GT3 WCT) hides / greys out full teams,
 *   - the public team registration form (IEC) only renders enough teammate
 *     rows to fill the cap,
 *   - createRegistration / createTeamRegistration re-check server-side
 *     (a crafted POST could bypass the UI),
 *   - the admin roster edit (updateRegistration) re-checks too — the cap
 *     is a hard limit, admins included.
 *
 * NOTE: not a "use server" module — it is imported by both server actions
 * and server components.
 */

import { prisma } from "@/lib/prisma";

/** Legacy slug shim — GT3 WCT seasons without an explicit cap default to 3. */
export const GT3_WCT_TEAM_LIMIT = 3;

/**
 * The per-team driver cap for a season, or null when the season is uncapped.
 *
 * Pass the season's `league.slug` and its `teamMaxDrivers` field. The
 * per-season value wins; the slug shim is a fallback so legacy GT3 WCT
 * seasons stay capped at 3 until they're explicitly backfilled.
 */
export function teamSizeLimit(input: {
  leagueSlug: string;
  teamMaxDrivers: number | null;
}): number | null {
  if (input.teamMaxDrivers != null && input.teamMaxDrivers > 0) {
    return input.teamMaxDrivers;
  }
  return input.leagueSlug === "cas-gt3-wct" ? GT3_WCT_TEAM_LIMIT : null;
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
      retiredAt: null,
      ...(excludeUserId ? { userId: { not: excludeUserId } } : {}),
    },
  });
}
