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

// Synthetic-ID ranges:
//   9001 – 9999  : reserved for src/data/iracing-tracks.json seed rows
//   10001+       : reserved for manually-added rows via the admin form
// Real iRacing track IDs are well below 1000, so future migration to
// the live API stays unambiguous.
const MANUAL_ID_BASE = 10001;

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

/**
 * Admin form on /admin/iracing/tracks for adding a single new track
 * variant by hand — e.g. iRacing released a new track and the curated
 * JSON hasn't been updated yet. Allocates a synthetic ID in the
 * MANUAL_ID_BASE range (so it can't collide with JSON-seed rows or
 * future real iRacing IDs).
 *
 * Idempotent: if a row already exists with the same (trackName,
 * configName) — case-insensitive — we update it instead of duplicating.
 */
export async function addIracingTrackManually(
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const trackName = String(formData.get("trackName") ?? "").trim();
  const configRaw = String(formData.get("configName") ?? "").trim();
  const configName = configRaw || null;
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const category = categoryRaw || null;

  if (!trackName) {
    redirect(
      "/admin/iracing/tracks?error=" +
        encodeURIComponent("Track name is required.")
    );
  }

  // Dedupe on (trackName, configName), case-insensitive.
  const existing = await prisma.iracingTrack.findFirst({
    where: {
      trackName: { equals: trackName, mode: "insensitive" },
      configName: configName
        ? { equals: configName, mode: "insensitive" }
        : null,
    },
    select: { iracingTrackId: true },
  });

  if (existing) {
    await prisma.iracingTrack.update({
      where: { iracingTrackId: existing.iracingTrackId },
      data: {
        trackName,
        configName,
        category: category ?? undefined,
        cachedAt: new Date(),
      },
    });
    revalidatePath("/admin/iracing/tracks");
    redirect("/admin/iracing/tracks?ok=1");
  }

  // Allocate next free ID at or above MANUAL_ID_BASE.
  const max = await prisma.iracingTrack.aggregate({
    _max: { iracingTrackId: true },
    where: { iracingTrackId: { gte: MANUAL_ID_BASE } },
  });
  const nextId = Math.max(MANUAL_ID_BASE, (max._max.iracingTrackId ?? MANUAL_ID_BASE - 1) + 1);

  await prisma.iracingTrack.create({
    data: {
      iracingTrackId: nextId,
      trackName,
      configName,
      category,
    },
  });

  revalidatePath("/admin/iracing/tracks");
  redirect("/admin/iracing/tracks?ok=1");
}

/**
 * Admin button next to each track row. Just deletes the row; the next
 * "Seed from JSON" will re-create it if it's still listed in the seed
 * file (so removing a JSON-seeded track only "sticks" if you also edit
 * the JSON).
 */
export async function deleteIracingTrack(formData: FormData): Promise<void> {
  await requireAdmin();
  const idRaw = String(formData.get("iracingTrackId") ?? "").trim();
  const iracingTrackId = parseInt(idRaw, 10);
  if (!Number.isFinite(iracingTrackId)) {
    redirect(
      "/admin/iracing/tracks?error=" +
        encodeURIComponent("Missing or invalid iracingTrackId.")
    );
  }
  await prisma.iracingTrack
    .delete({ where: { iracingTrackId } })
    .catch(() => {
      /* already gone — ignore */
    });
  revalidatePath("/admin/iracing/tracks");
  redirect("/admin/iracing/tracks?ok=1");
}
