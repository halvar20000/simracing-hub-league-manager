import { NextRequest, NextResponse } from "next/server";
import { matchTwitchForRecentRounds } from "@/lib/match-twitch";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Optional ?days=N override (manual backfill). Clamped to 1..2000; omitted
  // on the scheduled run, which uses the default lookback.
  const daysRaw = req.nextUrl.searchParams.get("days");
  const days =
    daysRaw && /^\d+$/.test(daysRaw)
      ? Math.max(1, Math.min(2000, parseInt(daysRaw, 10)))
      : undefined;

  const summary = await matchTwitchForRecentRounds(days);
  return NextResponse.json({
    ok: true,
    now: new Date().toISOString(),
    lookbackDays: days ?? "default",
    ...summary,
  });
}
