"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-helpers";
import { gateStintPlan, getStintPlanViewer } from "@/lib/stint-plan-access";

// Save/share actions for the stint planner.
//
// Since v2.2.0 these are NOT public any more. Every one of them goes through
// gateStintPlan() (src/lib/stint-plan-access.ts): you must be signed in to CLS
// and be the plan's creator, one of its drivers, someone the creator added, or
// an admin. The edit token still exists so old links keep working, but it is no
// longer what decides anything — a token that leaks into a Discord channel is
// exactly the hole Johann asked us to close.

export type SavePlanResult =
  | { ok: true; id: string; editToken: string }
  | { ok: false; error: string };

function cleanTitle(title: unknown): string {
  const t = typeof title === "string" ? title.trim() : "";
  return (t || "Stint Plan").slice(0, 120);
}

// ---------------------------------------------------------------------------
// Completed ("archived") plans
// ---------------------------------------------------------------------------
// A completed plan is frozen for planning but still open for the debrief.
// The freeze MUST live here, not in the UI: liveUpdateStintPlan deliberately
// takes no edit token, so anyone on the plan could otherwise still write to a
// finished plan. Instead of rejecting the save outright (which would also
// throw away a race log someone is attaching), we merge only the post-race
// keys onto the stored payload and drop the rest.
const ARCHIVED_MERGE_KEYS = ["eventResult", "raceLog", "poster", "impressions"] as const;

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? { ...(v as Record<string, unknown>) }
    : {};
}

/** Stored payload + only the analysis fields of the incoming one. */
function mergeArchivedPayload(stored: unknown, incoming: unknown): object {
  const base = asRecord(stored);
  const inc = asRecord(incoming);
  for (const k of ARCHIVED_MERGE_KEYS) {
    if (k in inc) base[k] = inc[k];
  }
  // Post-race notes are part of the debrief; pre/during notes freeze with the
  // plan so the record of what was decided beforehand stays honest.
  if ("notes" in inc) {
    const incNotes = asRecord(inc.notes);
    const baseNotes = asRecord(base.notes);
    if ("post" in incNotes) baseNotes.post = incNotes.post;
    base.notes = baseNotes;
  }
  return base;
}

/** Create a new saved plan, owned by the signed-in driver who made it.
 *  Every CLS member may do this — creating is open, reading is not. */
export async function createStintPlan(
  title: string,
  payload: unknown
): Promise<SavePlanResult> {
  const viewer = await getStintPlanViewer();
  if (!viewer) {
    return { ok: false, error: "Sign in to CLS to save a stint plan." };
  }
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
  const editToken = randomBytes(16).toString("hex");
  const plan = await prisma.stintPlan.create({
    data: {
      title: cleanTitle(title),
      payload: payload as object,
      editToken,
      createdByUserId: viewer.userId,
    },
    select: { id: true },
  });
  revalidatePath("/stint-planner");
  return { ok: true, id: plan.id, editToken };
}

/** Overwrite an existing plan. The edit token is carried through unchanged for
 *  the client's sake; access is what actually decides. */
export async function updateStintPlan(
  id: string,
  editToken: string,
  title: string,
  payload: unknown
): Promise<SavePlanResult> {
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
  const gate = await gateStintPlan(id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.stintPlan.findUnique({
    where: { id },
    select: { editToken: true, archivedAt: true, payload: true },
  });
  if (!existing) return { ok: false, error: "Plan not found." };

  if (existing.archivedAt) {
    // Completed: keep the title and the plan itself, take the debrief only.
    await prisma.stintPlan.update({
      where: { id },
      data: { payload: mergeArchivedPayload(existing.payload, payload) },
    });
    return { ok: true, id, editToken: existing.editToken };
  }
  await prisma.stintPlan.update({
    where: { id },
    data: { title: cleanTitle(title), payload: payload as object },
  });
  return { ok: true, id, editToken: existing.editToken };
}

/** Live-race save: overwrite a plan by id, so anyone ON the plan can push
 *  corrections during a race without hunting for the edit token. Returns the
 *  new updatedAt (ms) so clients can reconcile who has the freshest version. */
export async function liveUpdateStintPlan(
  id: string,
  title: string,
  payload: unknown
): Promise<{ ok: true; updatedAt: number } | { ok: false; error: string }> {
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
  const gate = await gateStintPlan(id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const existing = await prisma.stintPlan.findUnique({
    where: { id },
    select: { archivedAt: true, payload: true },
  });
  if (!existing) return { ok: false, error: "Plan not found." };

  const data = existing.archivedAt
    ? { payload: mergeArchivedPayload(existing.payload, payload) }
    : { title: cleanTitle(title), payload: payload as object };

  const plan = await prisma.stintPlan
    .update({ where: { id }, data, select: { updatedAt: true } })
    .catch(() => null);
  if (!plan) return { ok: false, error: "Plan not found." };
  return { ok: true, updatedAt: plan.updatedAt.getTime() };
}

/** Live-race poll: fetch a plan's current state + version for auto-refresh. */
export async function getStintPlanLive(
  id: string
): Promise<
  | {
      ok: true;
      updatedAt: number;
      title: string;
      payload: unknown;
      archivedAt: number | null;
    }
  | { ok: false }
> {
  const gate = await gateStintPlan(id);
  if (!gate.ok) return { ok: false };
  const p = await prisma.stintPlan.findUnique({
    where: { id },
    select: { title: true, payload: true, updatedAt: true, archivedAt: true },
  });
  if (!p) return { ok: false };
  return {
    ok: true,
    updatedAt: p.updatedAt.getTime(),
    title: p.title,
    payload: p.payload,
    // So a pit-wall tab that was open when someone else completed the plan
    // switches itself to read-only instead of fighting the server.
    archivedAt: p.archivedAt ? p.archivedAt.getTime() : null,
  };
}

/**
 * Mark a plan completed (frozen) or reopen it. Anyone on the plan may do it —
 * the same right as saving it — plus CLS admins. The editToken argument is
 * kept so the client call site does not have to change.
 */
export async function setStintPlanArchived(
  id: string,
  editToken: string | null,
  archived: boolean
): Promise<{ ok: true; archivedAt: number | null } | { ok: false; error: string }> {
  void editToken;
  const gate = await gateStintPlan(id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const updated = await prisma.stintPlan.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    select: { archivedAt: true },
  });
  revalidatePath("/stint-planner");
  revalidatePath(`/stint-planner/${id}`);
  return { ok: true, archivedAt: updated.archivedAt ? updated.archivedAt.getTime() : null };
}

/** Clone a plan you may open into a new one ("Copy of …") that belongs to you.
 *  The copy starts with an empty extra-access list on purpose: the drivers in
 *  it still get in by being drivers, but a hand-granted guest of the original
 *  does not silently follow the plan around. */
export async function duplicateStintPlan(id: string): Promise<SavePlanResult> {
  const gate = await gateStintPlan(id);
  if (!gate.ok) return { ok: false, error: gate.error };

  const src = await prisma.stintPlan.findUnique({
    where: { id },
    select: { title: true, payload: true },
  });
  if (!src) return { ok: false, error: "Plan not found." };
  const editToken = randomBytes(16).toString("hex");
  const plan = await prisma.stintPlan.create({
    data: {
      title: cleanTitle(`Copy of ${src.title}`),
      payload: (src.payload ?? {}) as object,
      editToken,
      createdByUserId: gate.viewer.userId,
    },
    select: { id: true },
  });
  revalidatePath("/stint-planner");
  return { ok: true, id: plan.id, editToken };
}

/** Delete a stint plan — ADMIN only. */
export async function deleteStintPlan(
  id: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await isAdmin())) {
    return { ok: false, error: "Only admins can delete stint plans." };
  }
  await prisma.stintPlan.delete({ where: { id } }).catch(() => null);
  revalidatePath("/stint-planner");
  return { ok: true };
}
