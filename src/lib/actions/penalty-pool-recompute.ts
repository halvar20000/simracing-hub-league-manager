"use server";

import { revalidatePath } from "next/cache";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

/**
 * Server action invoked by the admin "Recompute penalty pool" button.
 * Wraps the pure helper in /lib/penalty-pool.ts and revalidates the
 * admin season page so the new pool balance is reflected immediately.
 */
export async function recomputePenaltyPoolAction(formData: FormData) {
  const seasonId = formData.get("seasonId");
  const leagueSlug = formData.get("leagueSlug");
  if (typeof seasonId !== "string" || !seasonId) {
    throw new Error("seasonId required");
  }
  const result = await recomputePenaltyPoolForSeason(seasonId);
  if (typeof leagueSlug === "string" && leagueSlug) {
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  }
  return result;
}
