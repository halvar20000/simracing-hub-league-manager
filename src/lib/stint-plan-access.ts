import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * Who may open a stint plan — the single source of truth.
 *
 * The planner used to be wide open: no login, the whole list of plans public,
 * and `liveUpdateStintPlan` wrote to any plan by id without even the edit
 * token. Johann asked for that to stop. Since v2.2.0 a plan belongs to the CLS
 * user who created it, and only these people can open it:
 *
 *   • the creator (`createdByUserId`)
 *   • every driver on the plan — the driver rows already carry the CLS user id
 *     (that is what the Discord stint DMs are sent to)
 *   • anyone the creator added by hand (`accessUserIds`) — team boss, spotter,
 *     engineer, i.e. people who do not drive
 *   • CLS admins
 *
 * Everyone on that list has the SAME rights, deliberately: on the pit wall it
 * is rarely the plan's creator who types the live corrections.
 *
 * LEGACY PLANS: plans created before v2.2.0 have no `createdByUserId` — the
 * creator was never recorded and cannot be reconstructed. They fall back to
 * "the drivers in the plan (plus admins)", which is exactly the team that ran
 * that race. A legacy plan with no CLS drivers in it is admin-only.
 *
 * This module is imported by BOTH the pages and the server actions on purpose.
 * A rule that lives in two places drifts, and here drifting means a plan leaks.
 */

/** The signed-in viewer, as far as plan access cares. */
export type StintPlanViewer = { userId: string; isAdmin: boolean };

/** The columns every access check needs. */
export type StintPlanAccessRow = {
  createdByUserId: string | null;
  accessUserIds: string[];
  payload: unknown;
};

/** Prisma `select` fragment for the above — keeps the queries in sync. */
export const STINT_PLAN_ACCESS_SELECT = {
  createdByUserId: true,
  accessUserIds: true,
  payload: true,
} as const;

export const NO_ACCESS_ERROR =
  "This stint plan is not shared with you. Only the driver who created it, the drivers in it and the people they added can open it.";

/** CLS user ids of the drivers listed in a saved plan payload. */
export function planDriverUserIds(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const drivers = (payload as { drivers?: unknown }).drivers;
  if (!Array.isArray(drivers)) return [];
  const ids: string[] = [];
  for (const d of drivers) {
    if (d && typeof d === "object") {
      const id = (d as { id?: unknown }).id;
      // Hand-typed rows from before the CLS driver picker carry a local id that
      // matches no user; harmless, it simply never equals a viewer's id.
      if (typeof id === "string" && id !== "") ids.push(id);
    }
  }
  return ids;
}

/** Everyone who may open this plan, admins aside. */
export function planAllowedUserIds(plan: StintPlanAccessRow): string[] {
  const ids = new Set<string>(planDriverUserIds(plan.payload));
  for (const id of plan.accessUserIds ?? []) if (id) ids.add(id);
  if (plan.createdByUserId) ids.add(plan.createdByUserId);
  return [...ids];
}

/** May this viewer open AND edit the plan? */
export function canAccessStintPlan(
  plan: StintPlanAccessRow,
  viewer: StintPlanViewer | null
): boolean {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  return planAllowedUserIds(plan).includes(viewer.userId);
}

/**
 * May this viewer administer the plan — hand out access, connect a personal
 * Garage 61 token? The creator and admins only. A legacy plan has no creator,
 * so there anyone with access may do it; otherwise nobody could.
 */
export function canManageStintPlan(
  plan: StintPlanAccessRow,
  viewer: StintPlanViewer | null
): boolean {
  if (!viewer) return false;
  if (viewer.isAdmin) return true;
  if (plan.createdByUserId) return plan.createdByUserId === viewer.userId;
  return canAccessStintPlan(plan, viewer);
}

/** The signed-in viewer, or null. One query for session + role. */
export async function getStintPlanViewer(): Promise<StintPlanViewer | null> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (!user) return null;
  return { userId, isAdmin: user.role === "ADMIN" };
}

export type PlanGate =
  | { ok: true; viewer: StintPlanViewer; plan: StintPlanAccessRow }
  | { ok: false; error: string };

/**
 * Server-action gate: load the plan and check the viewer may touch it.
 *
 * `manage: true` demands creator/admin rights instead of plain access.
 */
export async function gateStintPlan(
  planId: string,
  opts: { manage?: boolean } = {}
): Promise<PlanGate> {
  if (!planId) return { ok: false, error: "Plan not found." };
  const viewer = await getStintPlanViewer();
  if (!viewer) {
    return { ok: false, error: "Sign in to CLS to open a stint plan." };
  }
  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: STINT_PLAN_ACCESS_SELECT,
  });
  if (!plan) return { ok: false, error: "Plan not found." };
  const allowed = opts.manage
    ? canManageStintPlan(plan, viewer)
    : canAccessStintPlan(plan, viewer);
  if (!allowed) {
    return {
      ok: false,
      error: opts.manage
        ? "Only the driver who created this plan (or an admin) can change that."
        : NO_ACCESS_ERROR,
    };
  }
  return { ok: true, viewer, plan };
}

/**
 * Gate for the plan-less helper actions (image / race-log / eventresult
 * upload). They write to Vercel Blob rather than to a plan, so there is
 * nothing to own — but they must not be an open upload endpoint for the whole
 * internet either.
 */
export async function requireSignedInViewer(): Promise<
  { ok: true; viewer: StintPlanViewer } | { ok: false; error: string }
> {
  const viewer = await getStintPlanViewer();
  if (!viewer) return { ok: false, error: "Sign in to CLS first." };
  return { ok: true, viewer };
}
