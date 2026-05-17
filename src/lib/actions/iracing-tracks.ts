"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import seedTracks from "@/data/iracing-tracks.json";

interface SeedTrack {
  iracingTrackId: number;
  trackName: string;
  configName?: string | null;
  category?: string | null;
}

/**
 * Admin button on /admin/iracing/tracks. Seeds (upserts) the
 * IracingTrack cache from src/data/iracing-tracks.json — a curated
 * static list maintained by hand.
 *
 * NOTE — iRacing retired the legacy email+password /data API auth in
 * the December 2025 season release. The OAuth2 replacement requires a
 * registered client ID, and iRacing has paused new client registrations
 * while they review third-party usage. Until they reopen, this static
 * seed file is the data source. To extend the list, just edit
 * src/data/iracing-tracks.json and click "Seed from JSON" again — it's
 * an upsert by iracingTrackId so it's safe to run repeatedly.
 */
export async function refreshIracingTracks(): Promise<void> {
  await requireAdmin();

  let imported = 0;
  // No transaction wrapper — each upsert is independent + idempotent,
  // and an interactive $transaction times out at 5 s on Neon's pooler
  // when batching ~100 sequential round-trips. Re-running on partial
  // failure just retries the missing rows.
  try {
    const tracks = seedTracks as SeedTrack[];
    for (const t of tracks) {
      if (!t.iracingTrackId || !t.trackName) continue;
      const configName =
        t.configName && t.configName.length > 0 ? t.configName : null;
      await prisma.iracingTrack.upsert({
        where: { iracingTrackId: t.iracingTrackId },
        update: {
          trackName: t.trackName,
          configName,
          category: t.category ?? null,
          cachedAt: new Date(),
        },
        create: {
          iracingTrackId: t.iracingTrackId,
          trackName: t.trackName,
          configName,
          category: t.category ?? null,
        },
      });
      imported++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(
      `/admin/iracing/tracks?ok=${imported}&error=${encodeURIComponent(msg)}`
    );
  }

  revalidatePath("/admin/iracing/tracks");
  redirect(`/admin/iracing/tracks?ok=${imported}`);
}
