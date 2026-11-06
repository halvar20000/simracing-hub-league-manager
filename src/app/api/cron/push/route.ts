import { NextRequest, NextResponse } from "next/server";
import { runPushSweep } from "@/lib/push-sweep";
import { sendInvitationReminders } from "@/lib/iracing-invite-notice";

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
  const dispatched = await runPushSweep(now);
  // Runs here rather than on its own endpoint: same 10-minute schedule, on both
  // the host crontab and the GitHub backup.
  const inviteReminders = await sendInvitationReminders(now);
  return NextResponse.json({
    ok: true,
    now: now.toISOString(),
    dispatched,
    inviteReminders,
  });
}
