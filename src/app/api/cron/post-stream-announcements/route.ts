import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postStreamAnnouncement } from "@/lib/notify-stream";
import { postDecision, liveChecker } from "@/lib/stream-post-timing";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const now = new Date();
  // Every unposted announcement of a race still ahead (or just begun): it
  // goes out right after the previous CAS stream ended, at the latest at its
  // "Post at" time (stream-post-timing.ts).
  const open = await prisma.streamAnnouncement.findMany({
    where: {
      postedAt: null,
      round: {
        startsAt: { gte: new Date(now.getTime() - 2 * 24 * 3600 * 1000) },
        season: {
          isArchived: false,
          league: { discordStreamChannelId: { not: null } },
        },
      },
    },
    select: { roundId: true, scheduledAt: true, createdAt: true, round: { select: { id: true, startsAt: true } } },
    orderBy: { round: { startsAt: "asc" } },
    take: 50,
  });
  const live = liveChecker();
  const due: { roundId: string }[] = [];
  const waiting: { roundId: string; why: string }[] = [];
  for (const a of open) {
    const d = await postDecision(a, live, now);
    if (d.due) due.push(a);
    else waiting.push({ roundId: a.roundId, why: d.why });
  }

  const fired: string[] = [];
  const skipped: { roundId: string; reason: string }[] = [];
  for (const a of due) {
    // force: the timing was decided above (scheduledAt may still be ahead)
    const r = await postStreamAnnouncement(a.roundId, { force: true });
    if (r.ok) fired.push(a.roundId);
    else
      skipped.push({
        roundId: a.roundId,
        reason: r.reason,
      });
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    fired,
    skipped,
    waiting,
  });
}
