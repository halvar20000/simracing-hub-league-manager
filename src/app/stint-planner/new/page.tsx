import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { defaultPlannerState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";
import { getClsTracks, getClsCars } from "@/lib/cls-tracks-cars";
import { getPitReferences } from "@/lib/pit-references";
import { getStintPlanViewer } from "@/lib/stint-plan-access";

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

  const [clsDrivers, tracks, cars, pitReferences] = await Promise.all([
    getClsDrivers(),
    getClsTracks(),
    getClsCars(),
  getPitReferences(),
  ]);
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-4 text-sm">
        <Link href="/stint-planner" className="text-zinc-400 hover:text-[#ff6b35]">
          ← All stint plans
        </Link>
      </div>
      <h1 className="mb-1 text-2xl font-bold">New Stint Plan</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Fuel, stints and driver rotation for an iRacing Special Event. Enter the
        race length, lap time, fuel per lap and tank size — add drivers from CLS
        and assign one to each stint, then save. The saved plan is yours: you,
        the drivers you put in it and anyone you add can open it.
      </p>
      <StintPlanner
        initial={defaultPlannerState()}
        clsDrivers={clsDrivers}
        tracks={tracks}
        cars={cars}
        pitReferences={pitReferences}
      />
    </main>
  );
}
