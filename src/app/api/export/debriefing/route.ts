import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  canAccessStintPlan,
  getStintPlanViewer,
} from "@/lib/stint-plan-access";
import { debriefForPlan, readDebriefHistory } from "@/lib/debrief-server";
import { buildDebriefPptx, debriefFileName } from "@/lib/debrief-pptx";

/**
 * The post-race de-briefing as an editable PowerPoint.
 *
 *   GET /api/export/debriefing?id=<planId>
 *
 * As private as the plan it comes from: the same rule as the page, out of the
 * same module (src/lib/stint-plan-access.ts). A plan id that turns up in a
 * Discord channel must not hand out the team's performance data.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing plan id." }, { status: 400 });
  }

  const viewer = await getStintPlanViewer();
  if (!viewer) {
    return NextResponse.json({ error: "Sign in to CLS." }, { status: 401 });
  }

  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      payload: true,
      updatedAt: true,
      createdByUserId: true,
      accessUserIds: true,
    },
  });
  if (!plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }
  if (!canAccessStintPlan(plan, viewer)) {
    return NextResponse.json(
      { error: "This plan isn't shared with you." },
      { status: 403 }
    );
  }

  const built = await debriefForPlan(plan);
  if (!built) {
    return NextResponse.json(
      { error: "No race log uploaded for this plan yet." },
      { status: 404 }
    );
  }

  const history = await readDebriefHistory(
    built.data.drivers.map((d) => d.name)
  );
  const buf = await buildDebriefPptx(
    built.data,
    {
      races: history.races.map((r) => r.label),
      series: built.data.drivers.map((d) => ({
        name: d.name,
        slot: d.slot,
        values: (history.byDriver.get(d.name) ?? []).map((p) =>
          p == null
            ? null
            : p.relPerfPpm != null
              ? p.relPerfPpm / 1_000_000
              : p.perf10kPpm != null
                ? p.perf10kPpm / 1_000_000
                : null
        ),
      })),
    },
    built.state.notes.post ?? ""
  );

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "Content-Disposition": `attachment; filename="${debriefFileName(built.data)}"`,
      "Cache-Control": "no-store",
    },
  });
}
