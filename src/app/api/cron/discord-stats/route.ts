/**
 * Daily cron: refresh the Discord community statistics snapshot.
 *
 * Triggered by .github/workflows/cron-discord-stats.yml once a day. Requires
 * Authorization: Bearer ${CRON_SECRET}. Scans Discord message history, so it
 * needs the full Node runtime and a raised maxDuration.
 */
import { NextRequest, NextResponse } from "next/server";
import { saveDiscordStatsSnapshot } from "@/lib/discord-stats";

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

  const data = await saveDiscordStatsSnapshot();

  return NextResponse.json({
    ok: true,
    generatedAt: data.generatedAt,
    totals: data.totals,
    scan: data.scan,
    errors: data.errors,
  });
}
