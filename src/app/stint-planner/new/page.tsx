import type { Metadata } from "next";
import Link from "next/link";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { defaultPlannerState } from "@/lib/stint-plan-state";
import { getClsDrivers } from "@/lib/cls-drivers";
import { getClsTracks, getClsCars } from "@/lib/cls-tracks-cars";

export const metadata: Metadata = pageMetadata({
  title: "New Stint Plan",
  description:
    "Plan fuel, stints and driver rotation for an iRacing Special Event — fuel per stint, pit windows, per-driver totals and a shareable schedule.",
  url: "/stint-planner/new",
});

export default async function NewStintPlanPage() {
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
      <h1 className="mb-1 text-2xl font-bold">New Stint Plan</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Fuel, stints and driver rotation for an iRacing Special Event. Enter the
        race length, lap time, fuel per lap and tank size — add drivers from CLS
        and assign one to each stint, then save to get a shareable link.
      </p>
      <StintPlanner
        initial={defaultPlannerState()}
        clsDrivers={clsDrivers}
        tracks={tracks}
        cars={cars}
      />
    </main>
  );
}
