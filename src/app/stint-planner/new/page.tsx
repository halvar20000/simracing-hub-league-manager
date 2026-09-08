import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { defaultPlannerState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";
import { getClsTracks, getClsCars } from "@/lib/cls-tracks-cars";
import { getPitReferences } from "@/lib/pit-references";
import { getPaceReferences } from "@/lib/pace-references";
import { getStintPlanViewer } from "@/lib/stint-plan-access";
import PlanPageHeader from "@/components/planner/PlanPageHeader";

export const metadata: Metadata = pageMetadata({
  title: "New Stint Plan",
  description:
    "Plan fuel, stints and driver rotation for an iRacing Special Event — fuel per stint, pit windows, per-driver totals and a shareable schedule.",
  url: "/stint-planner/new",
});

export default async function NewStintPlanPage() {
  // Creating stays open to the whole league — every CLS member may build a
  // plan. It is reading someone else's that is now closed.
  const viewer = await getStintPlanViewer();
  if (!viewer) redirect("/api/auth/signin?callbackUrl=/stint-planner/new");

  const [clsDrivers, tracks, cars, pitReferences, paceReferences] = await Promise.all([
    getClsDrivers(),
    getClsTracks(),
    getClsCars(),
  getPitReferences(),
    getPaceReferences(),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <PlanPageHeader variant="new" />
      <StintPlanner
        initial={defaultPlannerState()}
        clsDrivers={clsDrivers}
        tracks={tracks}
        cars={cars}
        pitReferences={pitReferences}
        paceReferences={paceReferences}
      />
    </main>
  );
}
