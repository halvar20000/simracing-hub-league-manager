// Server-only helper (NOT "use server"): who is on a stint plan, with names.
// Kept out of the action module on purpose — every exported async function in
// a "use server" file becomes a callable client endpoint, and this one takes
// the caller's word for `canManage`. Only the page and the gated actions
// import it.

import { prisma } from "@/lib/prisma";
import {
  planDriverUserIds,
  type StintPlanAccessRow,
} from "@/lib/stint-plan-access";

export type PlanPerson = { id: string; name: string };

export type PlanPeople = {
  /** The creator, or null for a plan from before v2.2.0. */
  owner: PlanPerson | null;
  /** Drivers in the line-up who are real CLS users (implicit access). */
  drivers: PlanPerson[];
  /** Hand-granted extras: team boss, spotter, engineer. */
  extra: PlanPerson[];
  /** May the current viewer add/remove extras? */
  canManage: boolean;
};

async function namesFor(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, firstName: true, lastName: true, name: true },
  });
  return new Map(
    users.map((u) => {
      const full = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
      return [u.id, full || u.name || "Unknown driver"];
    })
  );
}

/** Build the people list for a plan row the caller has already gated. */
export async function describePlanPeople(
  plan: StintPlanAccessRow,
  canManage: boolean
): Promise<PlanPeople> {
  const driverIds = planDriverUserIds(plan.payload);
  const extraIds = (plan.accessUserIds ?? []).filter((id) => !driverIds.includes(id));
  const names = await namesFor([
    ...(plan.createdByUserId ? [plan.createdByUserId] : []),
    ...driverIds,
    ...extraIds,
  ]);
  const toPerson = (id: string): PlanPerson => ({
    id,
    name: names.get(id) ?? "Unknown driver",
  });
  return {
    owner: plan.createdByUserId ? toPerson(plan.createdByUserId) : null,
    // A driver row that is not a real CLS user (a hand-typed name from before
    // the CLS picker) has no account to grant anything to — leave it out
    // instead of showing a ghost with access.
    drivers: driverIds.filter((id) => names.has(id)).map(toPerson),
    extra: extraIds.filter((id) => names.has(id)).map(toPerson),
    canManage,
  };
}
