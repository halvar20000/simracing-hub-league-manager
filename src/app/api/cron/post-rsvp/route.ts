import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { postRsvpForRound } from "@/lib/notify-rsvp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Pull upcoming rounds in active seasons that haven't been notified yet
  // AND whose league has a Discord RSVP channel configured.
  const candidates = await prisma.round.findMany({
    where: {
      status: "UPCOMING",
      rsvpNotifiedAt: null,
      season: {
        status: { in: ["OPEN_REGISTRATION", "ACTIVE"] },
        league: { discordRsvpChannelId: { not: null } },
      },
    },
    include: {
      season: { include: { league: true } },
    },
    take: 200,
  });

  const fired: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const round of candidates) {
    const daysBefore = round.season.league.rsvpDaysBefore;
    const opensAt = new Date(
      round.startsAt.getTime() - daysBefore * 24 * 3600 * 1000
    );
    if (opensAt > now) {
      skipped.push({ id: round.id, reason: "too-early" });
      continue;
    }

    const result = await postRsvpForRound(round.id);
    if (result.ok) {
      fired.push(round.id);
    } else {
      skipped.push({ id: round.id, reason: result.reason });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    fired,
    skipped,
  });
}
