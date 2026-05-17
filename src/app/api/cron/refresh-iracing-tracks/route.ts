import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAllIracingTracks } from "@/lib/iracing-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Weekly cron: refresh the IracingTrack cache.
 *
 * Hit by a GitHub Actions workflow (or Vercel Cron in vercel.json) with
 * Authorization: Bearer <CRON_SECRET>.
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorised" }, { status: 401 });
  }

  try {
    const tracks = await fetchAllIracingTracks();
    let imported = 0;
    for (const t of tracks) {
      if (!t.track_id || !t.track_name) continue;
      await prisma.iracingTrack.upsert({
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
    return NextResponse.json({ ok: true, imported });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
