import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendReminderForRound } from "@/lib/notify-rsvp-reminder";

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

  // Pull UPCOMING rounds in active seasons that have been notified and are
  // missing either reminder.
  const candidates = await prisma.round.findMany({
    where: {
      status: "UPCOMING",
      rsvpNotifiedAt: { not: null },
      season: {
        status: { in: ["OPEN_REGISTRATION", "ACTIVE"] },
        league: { discordRsvpChannelId: { not: null } },
      },
      OR: [
        { rsvpReminder48hAt: null },
        { rsvpReminder12hAt: null },
      ],
    },
    select: { id: true, startsAt: true, rsvpReminder48hAt: true, rsvpReminder12hAt: true },
    take: 200,
  });

  const fired: { id: string; kind: "48h" | "12h"; mentioned: number }[] = [];
  const skipped: { id: string; kind: "48h" | "12h"; reason: string }[] = [];

  for (const round of candidates) {
    const hoursToRace = (round.startsAt.getTime() - now.getTime()) / (3600 * 1000);

    if (!round.rsvpReminder48hAt && hoursToRace <= 48 && hoursToRace >= 24) {
      const r = await sendReminderForRound(round.id, "48h");
      if (r.ok) fired.push({ id: round.id, kind: "48h", mentioned: r.mentioned });
      else skipped.push({ id: round.id, kind: "48h", reason: r.reason });
    }

    if (!round.rsvpReminder12hAt && hoursToRace <= 12 && hoursToRace >= 2) {
      const r = await sendReminderForRound(round.id, "12h");
      if (r.ok) fired.push({ id: round.id, kind: "12h", mentioned: r.mentioned });
      else skipped.push({ id: round.id, kind: "12h", reason: r.reason });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    fired,
    skipped,
  });
}
