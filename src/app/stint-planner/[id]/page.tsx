import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { hydratePlanState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";
import { getClsTracks, getClsCars } from "@/lib/cls-tracks-cars";

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
  const plan = await prisma.stintPlan.findUnique({
    where: { id },
    select: { id: true, title: true, payload: true, updatedAt: true },
  });
  if (!plan) notFound();

  const initial = hydratePlanState(plan.payload, plan.title);
  const [clsDrivers, tracks, cars] = await Promise.all([
    getClsDrivers(),
    getClsTracks(),
    getClsCars(),
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
        Shared stint plan — live for the whole team. Changes save automatically
        and everyone&rsquo;s view refreshes within a few seconds.
      </p>
      <StintPlanner
        initial={initial}
        planId={plan.id}
        initialUpdatedAtMs={plan.updatedAt.getTime()}
        clsDrivers={clsDrivers}
        tracks={tracks}
        cars={cars}
      />
    </main>
  );
}
