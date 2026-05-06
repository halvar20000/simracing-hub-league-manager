import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyReportingOpenForRound } from "@/lib/actions/round-reporting";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel cron auto-attaches Authorization: Bearer ${CRON_SECRET}
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || authHeader !== expected) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Pull rounds that haven't been notified yet.
  const candidates = await prisma.round.findMany({
    where: {
      reportingNotifiedAt: null,
      season: {
        status: { in: ["OPEN_REGISTRATION", "ACTIVE"] },
        scoringSystem: {
          protestCooldownHours: { not: null },
        },
      },
    },
    include: {
      season: { include: { scoringSystem: true } },
    },
    take: 200,
  });

  const fired: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  for (const round of candidates) {
    const cooldown = round.season.scoringSystem?.protestCooldownHours;
    if (cooldown == null) {
      skipped.push({ id: round.id, reason: "no-cooldown" });
      continue;
    }
    const opensAt = new Date(round.startsAt.getTime() + cooldown * 3600 * 1000);
    if (opensAt > now) {
      skipped.push({ id: round.id, reason: "too-early" });
      continue;
    }

    const result = await notifyReportingOpenForRound(round.id);
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
