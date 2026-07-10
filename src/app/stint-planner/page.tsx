import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { formatDateTime } from "@/lib/date";
import StintPlanDuplicateButton from "@/components/StintPlanDuplicateButton";

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
  const plans = await prisma.stintPlan.findMany({
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, updatedAt: true, payload: true },
    take: 200,
  });

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stint Planner</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Fuel, stint and driver-rotation plans for iRacing Special Events.
          </p>
        </div>
        <Link
          href="/stint-planner/new"
          className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          + New plan
        </Link>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          No stint plans yet.{" "}
          <Link href="/stint-planner/new" className="text-[#ff6b35] hover:underline">
            Create the first one →
          </Link>
        </div>
      ) : (
        <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
          {plans.map((p) => {
            const peek = (p.payload ?? {}) as PayloadPeek;
            const duration = peek.event?.raceDuration ?? null;
            const track = peek.event?.track || null;
            const driverCount = Array.isArray(peek.drivers)
              ? peek.drivers.length
              : null;
            return (
              <li key={p.id} className="flex items-center gap-2 pr-3 hover:bg-zinc-900/60">
                <Link
                  href={`/stint-planner/${p.id}`}
                  className="flex flex-1 flex-wrap items-center justify-between gap-2 px-4 py-3"
                >
                  <span className="min-w-0">
                    <span className="font-medium text-zinc-100">{p.title}</span>
                    {track && (
                      <span className="ml-2 text-xs text-zinc-500">{track}</span>
                    )}
                  </span>
                  <span className="flex items-center gap-3 text-xs text-zinc-500">
                    {duration && <span>{duration}</span>}
                    {driverCount != null && <span>{driverCount} drivers</span>}
                    <span>{formatDateTime(p.updatedAt)}</span>
                  </span>
                </Link>
                <StintPlanDuplicateButton planId={p.id} />
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
