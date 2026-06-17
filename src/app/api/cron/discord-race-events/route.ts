import { NextRequest, NextResponse } from "next/server";
import { createRaceEventsForUpcomingRounds } from "@/lib/notify-race-event";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = await createRaceEventsForUpcomingRounds();
  return NextResponse.json({ ok: true, now: new Date().toISOString(), ...summary });
}
