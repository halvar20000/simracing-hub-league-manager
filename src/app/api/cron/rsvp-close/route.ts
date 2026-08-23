/**
 * Cron: refresh RSVP embeds when they cross the close window.
 *
 * Strategy: find UPCOMING rounds whose Discord message has been posted,
 * where rsvpClosedAt is still null, and where the close-window cutoff
 * (startsAt - league.rsvpCloseBeforeHours) has already passed. For each,
 * stamp rsvpClosedAt = now and refresh the embed — the embed builder
 * picks up the closed state via isRsvpClosed and renders disabled buttons.
 *
 * Interactions endpoint already rejects late clicks based on the same
 * helper, so this cron is just for visual freshness — even without it
 * the click would fail with "registration closed".
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { refreshDiscordRsvpMessage } from "@/lib/rsvp";
import { isRsvpClosed } from "@/lib/rsvp-window";

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

  const candidates = await prisma.round.findMany({
    where: {
      status: "UPCOMING",
      rsvpNotifiedAt: { not: null },
      rsvpClosedAt: null,
      season: {
        isArchived: false,
        league: { discordRsvpChannelId: { not: null } },
      },
    },
    select: {
      id: true,
      startsAt: true,
      status: true,
      season: {
        select: {
          league: { select: { rsvpCloseBeforeHours: true } },
        },
      },
    },
    take: 200,
  });

  const closed: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const r of candidates) {
    const isClosed = isRsvpClosed(
      {
        startsAt: r.startsAt,
        status: r.status,
        rsvpCloseBeforeHours: r.season.league.rsvpCloseBeforeHours,
      },
      now
    );
    if (!isClosed) {
      skipped.push({ id: r.id, reason: "still-open" });
      continue;
    }
    await prisma.round.update({
      where: { id: r.id },
      data: { rsvpClosedAt: now },
    });
    try {
      await refreshDiscordRsvpMessage(r.id);
      closed.push(r.id);
    } catch {
      skipped.push({ id: r.id, reason: "refresh-failed" });
    }
  }

  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    closed,
    skipped,
  });
}
