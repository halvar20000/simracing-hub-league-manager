"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { gateStintPlan } from "@/lib/stint-plan-access";
import {
  debriefForPlan,
  racedAtOf,
  writeDebriefHistory,
} from "@/lib/debrief-server";

/**
 * Freeze a plan's debriefing figures into the history table.
 *
 * Called from the debriefing page, and automatically when a plan is marked
 * completed — that is the moment the race is over and the numbers stop moving.
 * Idempotent: it upserts this plan's own rows and nobody else's, so pressing
 * it again after correcting a stint simply brings the trend up to date.
 */
export async function refreshDebriefHistory(
  planId: string
): Promise<{ ok: true; drivers: number } | { ok: false; error: string }> {
  const gate = await gateStintPlan(planId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: { id: true, title: true, payload: true, updatedAt: true },
  });
  if (!plan) return { ok: false, error: "Plan not found." };

  const built = await debriefForPlan(plan);
  if (!built) {
    return {
      ok: false,
      error: "Für diesen Plan ist noch kein Race-Log hochgeladen.",
    };
  }
  const n = await writeDebriefHistory(
    plan,
    built.data,
    racedAtOf(built.state, plan)
  );
  revalidatePath(`/stint-planner/${planId}/debriefing`);
  return { ok: true, drivers: n };
}
