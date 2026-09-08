import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import PlanIndexView, {
  type PlanListRow,
} from "@/components/planner/PlanIndexView";
import {
  canAccessStintPlan,
  getStintPlanViewer,
} from "@/lib/stint-plan-access";

export const metadata: Metadata = pageMetadata({
  title: "Stint Planner",
  description:
    "Endurance stint plans for iRacing Special Events — fuel, stints and driver rotation. Open an existing plan or start a new one.",
  url: "/stint-planner",
});

// Shape we read out of the saved JSON payload for the list summary.
type PayloadPeek = {
  event?: { raceDuration?: string; track?: string; car?: string };
  drivers?: unknown[];
};

export default async function StintPlannerIndexPage() {
  // Signed-in only, and you see your own plans: the ones you created, the ones
  // you are driving in, and the ones somebody added you to. Admins see all.
  const viewer = await getStintPlanViewer();
  if (!viewer) redirect("/api/auth/signin?callbackUrl=/stint-planner");

  const all = await prisma.stintPlan.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      archivedAt: true,
      payload: true,
      createdByUserId: true,
      accessUserIds: true,
    },
    take: 200,
  });
  // The driver ids live inside the payload JSON, so this filter cannot be a
  // WHERE clause — the payload is already selected for the row summary anyway.
  const plans = all.filter((p) => canAccessStintPlan(p, viewer));

  // Reduce each row to what the list actually renders before it crosses to the
  // client: the whole payload is a large JSON blob and none of it is needed
  // there beyond these three fields.
  const toRow = (p: (typeof plans)[number]): PlanListRow => {
    const peek = (p.payload ?? {}) as PayloadPeek;
    return {
      id: p.id,
      title: p.title,
      stampMs: (p.archivedAt ?? p.updatedAt).getTime(),
      archived: p.archivedAt != null,
      track: peek.event?.track || null,
      duration: peek.event?.raceDuration ?? null,
      driverCount: Array.isArray(peek.drivers) ? peek.drivers.length : null,
    };
  };

  const active = plans.filter((p) => !p.archivedAt).map(toRow);
  // Completed plans read as a history: newest race first.
  const completed = plans
    .filter((p) => p.archivedAt)
    .sort((a, b) => (b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0))
    .map(toRow);

  return (
    <PlanIndexView active={active} completed={completed} admin={viewer.isAdmin} />
  );
}
