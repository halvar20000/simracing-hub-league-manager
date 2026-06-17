"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { ensureRaceEventForRound } from "@/lib/notify-race-event";

/**
 * Admin button: create (or update) the Discord scheduled event for a round.
 * Uses force so it also fixes an existing event after a reschedule. Redirects
 * back to the admin round page with an `event=` status flag.
 */
export async function createRaceEventAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const slug = String(formData.get("slug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const base = `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;

  const res = await ensureRaceEventForRound(roundId, { force: true });

  let flag: string;
  if (res.ok) {
    flag = res.action === "updated" ? "updated" : "created";
  } else {
    flag = `failed:${res.reason}`;
  }

  revalidatePath(base);
  redirect(`${base}?event=${encodeURIComponent(flag)}`);
}
