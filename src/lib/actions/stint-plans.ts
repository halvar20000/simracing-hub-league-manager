"use server";

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

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
    select: { editToken: true },
  });
  if (!existing) return { ok: false, error: "Plan not found." };
  if (existing.editToken !== editToken) {
    return { ok: false, error: "You do not have edit rights for this plan." };
  }
  await prisma.stintPlan.update({
    where: { id },
    data: { title: cleanTitle(title), payload: payload as object },
  });
  return { ok: true, id, editToken };
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
