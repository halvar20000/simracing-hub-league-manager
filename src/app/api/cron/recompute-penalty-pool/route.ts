/**
 * Maintenance endpoint: re-run the penalty-pool auto-forgiveness engine for a
 * season without going through the admin UI.
 *
 * Needed whenever a pool rule changes retroactively (e.g. switching
 * Season.noShowForgivenessEnabled on for a season whose rounds are already
 * COMPLETED) — the engine is idempotent, so calling this is always safe.
 *
 *   GET /api/cron/recompute-penalty-pool?seasonId=<id>
 *   Authorization: Bearer ${CRON_SECRET}
 *
 * Without seasonId every season whose scoring system runs the pool in FULL
 * mode is recomputed.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const seasonId = req.nextUrl.searchParams.get("seasonId");

  const seasons = seasonId
    ? await prisma.season.findMany({
        where: { id: seasonId },
        select: { id: true, name: true },
      })
    : await prisma.season.findMany({
        where: { scoringSystem: { penaltyPoolMode: "FULL" } },
        select: { id: true, name: true },
      });

  const results = [];
  for (const s of seasons) {
    const r = await recomputePenaltyPoolForSeason(s.id);
    results.push({ seasonId: s.id, season: s.name, ...r });
  }

  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    seasons: results,
  });
}
