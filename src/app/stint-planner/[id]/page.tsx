import type { Metadata } from "next";
import Link from "next/link";
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

/** Shown to a signed-in CLS member who is simply not on this plan. */
function NoAccess() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold">This plan isn&rsquo;t shared with you</h1>
      <p className="mb-6 text-sm text-zinc-400">
        A stint plan can only be opened by the driver who created it, the
        drivers in it, the people they added and CLS admins. If you should be in
        it, ask whoever built the plan to add you — there is a{" "}
        <span className="text-zinc-300">Who can open this plan</span> box on
        their side.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/stint-planner"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Your stint plans
        </Link>
        <Link
          href="/stint-planner/new"
          className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          + New plan
        </Link>
      </div>
    </main>
  );
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
  if (!canAccessStintPlan(plan, viewer)) return <NoAccess />;

  const canManage = canManageStintPlan(plan, viewer);
  const initial = hydratePlanState(plan.payload, plan.title);
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
      <div className="mb-4 text-sm">
        <Link href="/stint-planner" className="text-zinc-400 hover:text-[#ff6b35]">
          ← All stint plans
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">Endurance Stint Planner</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        {plan.archivedAt
          ? "Completed plan — the race is done, so the plan itself is frozen. The debrief below stays open."
          : "Shared stint plan — live for everyone on it. Changes save automatically and everyone’s view refreshes within a few seconds."}
      </p>

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
