import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";
import StintPlanner from "@/components/StintPlanner";
import { defaultPlannerState } from "@/lib/stint-plan-state";

export const metadata: Metadata = pageMetadata({
  title: "Endurance Stint Planner",
  description:
    "Plan fuel, stints and driver rotation for iRacing Special Events — fuel per stint, pit windows, per-driver stint totals and a shareable schedule.",
  url: "/stint-planner",
});

export default function StintPlannerPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold">Endurance Stint Planner</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Fuel, stints and driver rotation for iRacing Special Events. Enter your
        race length, lap time, fuel per lap and tank size — assign drivers to
        each stint, then save to get a shareable link for your team.
      </p>
      <StintPlanner initial={defaultPlannerState()} />
    </main>
  );
}
