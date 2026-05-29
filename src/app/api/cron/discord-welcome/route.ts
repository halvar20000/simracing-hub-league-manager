/**
 * Daily cron: welcome new Discord members.
 *
 * Triggered by .github/workflows/cron-discord-welcome.yml once a day.
 * Requires Authorization: Bearer ${CRON_SECRET}. See src/lib/notify-welcome.ts
 * for the batching / watermark logic.
 */
import { NextRequest, NextResponse } from "next/server";
import { runWelcome } from "@/lib/notify-welcome";

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

  const result = await runWelcome();
  return NextResponse.json(result);
}
