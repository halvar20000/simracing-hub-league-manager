"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { saveDiscordStatsSnapshot } from "@/lib/discord-stats";

/**
 * Admin "Refresh" button on /admin/discord-stats. Rebuilds the Discord
 * community statistics snapshot and stores it.
 *
 * This scans Discord message history, so it is slow — the admin page sets a
 * raised `maxDuration` to give it room. The daily cron keeps the snapshot
 * fresh without anyone clicking.
 */
export async function refreshDiscordStatsAction(): Promise<void> {
  await requireAdmin();
  await saveDiscordStatsSnapshot();
  revalidatePath("/admin/discord-stats");
}
