"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { gateStintPlan } from "@/lib/stint-plan-access";
import { describePlanPeople, type PlanPeople } from "@/lib/stint-plan-people";

// Letting the plan's creator add someone who is not driving: team boss,
// spotter, engineer. Drivers never appear here — they are on the plan by being
// in the line-up, so taking a driver out of the line-up takes their access
// with it instead of leaving a stale grant behind.

export type PeopleResult =
  | { ok: true; people: PlanPeople }
  | { ok: false; error: string };

/** Give a CLS user access to a plan they are not driving in. */
export async function addStintPlanPerson(
  planId: string,
  userId: string
): Promise<PeopleResult> {
  const gate = await gateStintPlan(planId, { manage: true });
  if (!gate.ok) return { ok: false, error: gate.error };

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!user) return { ok: false, error: "No such CLS driver." };
  if (gate.plan.accessUserIds.includes(userId)) {
    return { ok: true, people: await describePlanPeople(gate.plan, true) };
  }

  const updated = await prisma.stintPlan.update({
    where: { id: planId },
    data: { accessUserIds: { push: userId } },
    select: { createdByUserId: true, accessUserIds: true, payload: true },
  });
  revalidatePath(`/stint-planner/${planId}`);
  revalidatePath("/stint-planner");
  return { ok: true, people: await describePlanPeople(updated, true) };
}

/** Take a hand-granted access away again. Drivers cannot be removed here —
 *  take them out of the line-up instead. */
export async function removeStintPlanPerson(
  planId: string,
  userId: string
): Promise<PeopleResult> {
  const gate = await gateStintPlan(planId, { manage: true });
  if (!gate.ok) return { ok: false, error: gate.error };

  const updated = await prisma.stintPlan.update({
    where: { id: planId },
    data: { accessUserIds: gate.plan.accessUserIds.filter((id) => id !== userId) },
    select: { createdByUserId: true, accessUserIds: true, payload: true },
  });
  revalidatePath(`/stint-planner/${planId}`);
  revalidatePath("/stint-planner");
  return { ok: true, people: await describePlanPeople(updated, true) };
}
