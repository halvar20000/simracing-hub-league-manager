"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { fetchAllIracingTracks } from "@/lib/iracing-api";

/**
 * Admin button on /admin/iracing/tracks. Pulls the full track list from
 * iRacing, upserts every row in IracingTrack, and redirects back with a
 * status query string ("ok=<count>" or "error=<msg>").
 */
export async function refreshIracingTracks(): Promise<void> {
  await requireAdmin();

  let imported = 0;
  try {
    const tracks = await fetchAllIracingTracks();
    await prisma.$transaction(async (tx) => {
      for (const t of tracks) {
        if (!t.track_id || !t.track_name) continue;
        await tx.iracingTrack.upsert({
          where: { iracingTrackId: t.track_id },
          update: {
            trackName: t.track_name,
            configName: t.config_name ?? null,
            category: t.category ?? null,
            freeContent: !!t.free_with_subscription,
            cachedAt: new Date(),
          },
          create: {
            iracingTrackId: t.track_id,
            trackName: t.track_name,
            configName: t.config_name ?? null,
            category: t.category ?? null,
            freeContent: !!t.free_with_subscription,
          },
        });
        imported++;
      }
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(`/admin/iracing/tracks?error=${encodeURIComponent(msg)}`);
  }

  revalidatePath("/admin/iracing/tracks");
  redirect(`/admin/iracing/tracks?ok=${imported}`);
}
