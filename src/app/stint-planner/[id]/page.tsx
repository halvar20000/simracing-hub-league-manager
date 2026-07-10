import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { defaultPlannerState, type PlannerState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";

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
    select: { id: true, title: true, payload: true },
  });
  if (!plan) notFound();

  // Merge stored payload over the current defaults so a plan saved by an older
  // build still opens cleanly if the shape ever gains fields.
  const base = defaultPlannerState();
  const stored = (plan.payload ?? {}) as Partial<PlannerState>;
  const initial: PlannerState = { ...base, ...stored, title: plan.title };
  const clsDrivers = await getClsDrivers();

  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 text-sm">
        <Link href="/stint-planner" className="text-zinc-400 hover:text-[#ff6b35]">
          ← All stint plans
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">Endurance Stint Planner</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Shared stint plan. Changes stay local until saved — the team member who
        created it can overwrite it; anyone else can open “Save as new”.
      </p>
      <StintPlanner initial={initial} planId={plan.id} clsDrivers={clsDrivers} />
    </main>
  );
}
