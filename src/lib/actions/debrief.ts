"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { gateStintPlan } from "@/lib/stint-plan-access";
import {
  debriefForPlan,
  racedAtOf,
  writeDebriefHistory,
} from "@/lib/debrief-server";
import { resolvePlanTeam } from "@/lib/plan-team";
import { teamGroupSlug } from "@/lib/team-grouping";

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
): Promise<
  | { ok: true; drivers: number; team: string | null }
  | { ok: false; error: string }
> {
  const gate = await gateStintPlan(planId);
  if (!gate.ok) return { ok: false, error: gate.error };

  const plan = await prisma.stintPlan.findUnique({
    where: { id: planId },
    select: {
      id: true,
      title: true,
      payload: true,
      updatedAt: true,
      teamId: true,
    },
  });
  if (!plan) return { ok: false, error: "Plan not found." };

  const built = await debriefForPlan(plan);
  if (!built) {
    return {
      ok: false,
      error: "Für diesen Plan ist noch kein Race-Log hochgeladen.",
    };
  }
  const team = await resolvePlanTeam(plan, built.state);
  const n = await writeDebriefHistory(
    plan,
    built.data,
    racedAtOf(built.state, plan),
    team,
    { race: built.race, state: built.state }
  );
  revalidatePath(`/stint-planner/${planId}/debriefing`);
  if (team.teamGroup) revalidatePath(`/teams/${teamGroupSlug(team.teamGroup)}/statistik`);
  return { ok: true, drivers: n, team: team.teamGroupName };
}

/**
 * Correct the team a plan raced for.
 *
 * The automatic answer comes from the drivers in the line-up and is right for
 * an ordinary team entry; it is wrong for a guest line-up or for someone
 * registered with two teams, and then a human says so. Passing null goes back
 * to the automatic answer rather than clearing the team.
 */
export async function setStintPlanTeam(
  planId: string,
  teamId: string | null
): Promise<{ ok: true; team: string | null } | { ok: false; error: string }> {
  const gate = await gateStintPlan(planId, { manage: true });
  if (!gate.ok) return { ok: false, error: gate.error };

  await prisma.stintPlan.update({
    where: { id: planId },
    data: { teamId: teamId && teamId.trim() !== "" ? teamId : null },
  });
  // The statistic is derived from these rows, so it has to be rewritten — a
  // plan silently filed under the wrong team is worse than no statistic.
  const res = await refreshDebriefHistory(planId);
  revalidatePath(`/stint-planner/${planId}/debriefing`);
  return {
    ok: true,
    team: res.ok ? (res.team ?? null) : null,
  };
}

