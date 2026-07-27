"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { isAdmin } from "@/lib/auth-helpers";

// Save/share actions for the public stint planner. No auth: plans are
// unguessable by id, and editing requires the secret editToken returned at
// creation. Called programmatically from the client (not as <form action>).

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
// takes no edit token, so anyone with the link could otherwise still write to
// a finished plan. Instead of rejecting the save outright (which would also
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

async function planArchivedAt(id: string): Promise<Date | null | undefined> {
  const p = await prisma.stintPlan.findUnique({
    where: { id },
    select: { archivedAt: true },
  });
  return p ? p.archivedAt : undefined; // undefined = no such plan
}

/** Create a new saved plan. Returns its id + edit token. */
export async function createStintPlan(
  title: string,
  payload: unknown
): Promise<SavePlanResult> {
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
  const editToken = randomBytes(16).toString("hex");
  const plan = await prisma.stintPlan.create({
    data: {
      title: cleanTitle(title),
      payload: payload as object,
      editToken,
    },
    select: { id: true },
  });
  return { ok: true, id: plan.id, editToken };
}

/** Overwrite an existing plan — only with the matching edit token. */
export async function updateStintPlan(
  id: string,
  editToken: string,
  title: string,
  payload: unknown
): Promise<SavePlanResult> {
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
  const existing = await prisma.stintPlan.findUnique({
    where: { id },
    select: { editToken: true, archivedAt: true, payload: true },
  });
  if (!existing) return { ok: false, error: "Plan not found." };
  if (existing.editToken !== editToken) {
    return { ok: false, error: "You do not have edit rights for this plan." };
  }
  if (existing.archivedAt) {
    // Completed: keep the title and the plan itself, take the debrief only.
    await prisma.stintPlan.update({
      where: { id },
      data: { payload: mergeArchivedPayload(existing.payload, payload) },
    });
    return { ok: true, id, editToken };
  }
  await prisma.stintPlan.update({
    where: { id },
    data: { title: cleanTitle(title), payload: payload as object },
  });
  return { ok: true, id, editToken };
}

/** Live-race save: overwrite a plan by id with NO edit-token check, so anyone
 *  with the link can push corrections during a race. Returns the new updatedAt
 *  (ms) so clients can reconcile who has the freshest version. */
export async function liveUpdateStintPlan(
  id: string,
  title: string,
  payload: unknown
): Promise<{ ok: true; updatedAt: number } | { ok: false; error: string }> {
  if (payload == null || typeof payload !== "object") {
    return { ok: false, error: "Invalid plan data." };
  }
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
 * Mark a plan completed (frozen) or reopen it. Allowed for whoever holds the
 * plan's edit token — the same right as saving it — and for CLS admins.
 */
export async function setStintPlanArchived(
  id: string,
  editToken: string | null,
  archived: boolean
): Promise<{ ok: true; archivedAt: number | null } | { ok: false; error: string }> {
  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: { editToken: true },
  });
  if (!plan) return { ok: false, error: "Plan not found." };
  if (plan.editToken !== editToken && !(await isAdmin())) {
    return {
      ok: false,
      error:
        "Only the plan's owner can do that — open it in the browser you created it in, or ask an admin.",
    };
  }
  const updated = await prisma.stintPlan.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
    select: { archivedAt: true },
  });
  revalidatePath("/stint-planner");
  revalidatePath(`/stint-planner/${id}`);
  return { ok: true, archivedAt: updated.archivedAt ? updated.archivedAt.getTime() : null };
}

/** Clone an existing plan into a new one ("Copy of …") the caller can edit. */
export async function duplicateStintPlan(
  id: string
): Promise<SavePlanResult> {
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
    },
    select: { id: true },
  });
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
