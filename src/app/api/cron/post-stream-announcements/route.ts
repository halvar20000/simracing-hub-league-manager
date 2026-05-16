import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postStreamAnnouncement } from "@/lib/notify-stream";

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
  const due = await prisma.streamAnnouncement.findMany({
    where: {
      postedAt: null,
      scheduledAt: { lte: now },
      round: {
        season: { league: { discordStreamChannelId: { not: null } } },
      },
    },
    select: { roundId: true },
    take: 50,
  });

  const fired: string[] = [];
  const skipped: { roundId: string; reason: string }[] = [];
  for (const a of due) {
    const r = await postStreamAnnouncement(a.roundId);
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
  });
}
