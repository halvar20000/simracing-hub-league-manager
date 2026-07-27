"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAuth, requireAdmin } from "@/lib/auth-helpers";
import { generateRaceLoggerToken } from "@/lib/race-logger";

/**
 * Mint (or replace) the signed-in driver's personal race-logger token.
 * Replacing invalidates the old one immediately — the driver then pastes the
 * new token into the logger's setup page.
 */
export async function regenerateRaceLoggerToken(): Promise<void> {
  const me = await requireAuth();
  await prisma.user.update({
    where: { id: me.id },
    data: {
      raceLoggerToken: generateRaceLoggerToken(),
      raceLoggerTokenCreatedAt: new Date(),
    },
  });
  revalidatePath("/race-logger");
}

/** Turn auto-upload off for good: the logger can no longer send anything. */
export async function revokeRaceLoggerToken(): Promise<void> {
  const me = await requireAuth();
  await prisma.user.update({
    where: { id: me.id },
    data: { raceLoggerToken: null, raceLoggerTokenCreatedAt: null },
  });
  revalidatePath("/race-logger");
}

/**
 * Admin: attach an auto-uploaded log to a round (or detach it again by
 * submitting an empty roundId). Used from the Race Center page when the
 * auto-matcher could not decide.
 */
export async function assignRaceLogUploadToRound(formData: FormData): Promise<void> {
  await requireAdmin();
  const uploadId = String(formData.get("uploadId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const back = String(formData.get("back") ?? "");
  if (!uploadId) throw new Error("Missing uploadId");

  await prisma.raceLogUpload.update({
    where: { id: uploadId },
    data: { roundId: roundId || null, matchedAutomatically: false },
  });

  if (back) {
    revalidatePath(back);
    redirect(back + "?ok=" + encodeURIComponent(roundId ? "Log attached to this round" : "Log detached"));
  }
}

/** Admin: drop an uploaded log (blob + row). */
export async function deleteRaceLogUpload(formData: FormData): Promise<void> {
  await requireAdmin();
  const uploadId = String(formData.get("uploadId") ?? "");
  const back = String(formData.get("back") ?? "");
  if (!uploadId) throw new Error("Missing uploadId");

  const row = await prisma.raceLogUpload.findUnique({
    where: { id: uploadId },
    select: { blobUrl: true },
  });
  if (row?.blobUrl) {
    try {
      await del(row.blobUrl);
    } catch {
      /* blob already gone — carry on */
    }
  }
  await prisma.raceLogUpload.delete({ where: { id: uploadId } });

  if (back) {
    revalidatePath(back);
    redirect(back + "?ok=" + encodeURIComponent("Log deleted"));
  }
}
