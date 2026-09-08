import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import StintPlanAccessPanel from "@/components/StintPlanAccessPanel";
import { hydratePlanState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";
import { getClsTracks, getClsCars } from "@/lib/cls-tracks-cars";
import { getPitReferences } from "@/lib/pit-references";
import { getPaceReferences } from "@/lib/pace-references";
import {
  canAccessStintPlan,
  canManageStintPlan,
  getStintPlanViewer,
} from "@/lib/stint-plan-access";
import { describePlanPeople } from "@/lib/stint-plan-people";
import PlanPageHeader from "@/components/planner/PlanPageHeader";
import NoPlanAccess from "@/components/planner/NoPlanAccess";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: { title: true },
  });
  return pageMetadata({
    title: plan ? `${plan.title} — Stint Plan` : "Stint Plan",
    description:
      "Endurance stint plan — fuel, stints and driver rotation for an iRacing Special Event.",
    url: `/stint-planner/${id}`,
  });
}

export default async function SavedStintPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const viewer = await getStintPlanViewer();
  if (!viewer) {
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(`/stint-planner/${id}`)}`);
  }

  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      payload: true,
      updatedAt: true,
      archivedAt: true,
      createdByUserId: true,
      accessUserIds: true,
    },
  });
  if (!plan) notFound();

  // The gate. The server actions repeat it — this only decides what is drawn.
  if (!canAccessStintPlan(plan, viewer)) return <NoPlanAccess />;

  const canManage = canManageStintPlan(plan, viewer);
  const initial = hydratePlanState(plan.payload, plan.title);
  // The de-briefing only exists once there is something to brief on.
  const hasRaceLog = initial.raceLog != null;
  const [clsDrivers, tracks, cars, pitReferences, paceReferences, people] =
    await Promise.all([
      getClsDrivers(),
      getClsTracks(),
      getClsCars(),
      getPitReferences(),
      getPaceReferences(),
      describePlanPeople(plan, canManage),
    ]);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PlanPageHeader
        variant="plan"
        archived={plan.archivedAt != null}
        debriefHref={hasRaceLog ? `/stint-planner/${plan.id}/debriefing` : null}
      />

      <StintPlanAccessPanel planId={plan.id} initial={people} clsDrivers={clsDrivers} />

      <StintPlanner
        initial={initial}
        planId={plan.id}
        initialUpdatedAtMs={plan.updatedAt.getTime()}
        initialArchivedAtMs={plan.archivedAt ? plan.archivedAt.getTime() : null}
        viewerIsAdmin={viewer.isAdmin}
        viewerCanManage={canManage}
        clsDrivers={clsDrivers}
        tracks={tracks}
        cars={cars}
        pitReferences={pitReferences}
        paceReferences={paceReferences}
      />
    </main>
  );
}
