import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { formatDateTime } from "@/lib/date";
import StintPlanDuplicateButton from "@/components/StintPlanDuplicateButton";
import StintPlanDeleteButton from "@/components/StintPlanDeleteButton";
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

type PlanRow = {
  id: string;
  title: string;
  updatedAt: Date;
  archivedAt: Date | null;
  payload: unknown;
  createdByUserId: string | null;
  accessUserIds: string[];
};

function PlanList({
  plans,
  admin,
  dimmed = false,
}: {
  plans: PlanRow[];
  admin: boolean;
  dimmed?: boolean;
}) {
  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
      {plans.map((p) => {
        const peek = (p.payload ?? {}) as PayloadPeek;
        const duration = peek.event?.raceDuration ?? null;
        const track = peek.event?.track || null;
        const driverCount = Array.isArray(peek.drivers) ? peek.drivers.length : null;
        return (
          <li
            key={p.id}
            className={`flex items-center gap-2 pr-3 hover:bg-zinc-900/60 ${
              dimmed ? "bg-zinc-950/40" : ""
            }`}
          >
            <Link
              href={`/stint-planner/${p.id}`}
              className="flex flex-1 flex-wrap items-center justify-between gap-2 px-4 py-3"
            >
              <span className="min-w-0">
                <span
                  className={`font-medium ${dimmed ? "text-zinc-400" : "text-zinc-100"}`}
                >
                  {p.title}
                </span>
                {track && <span className="ml-2 text-xs text-zinc-500">{track}</span>}
                {p.archivedAt && (
                  <span className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                    completed
                  </span>
                )}
              </span>
              <span className="flex items-center gap-3 text-xs text-zinc-500">
                {duration && <span>{duration}</span>}
                {driverCount != null && <span>{driverCount} drivers</span>}
                <span>{formatDateTime(p.archivedAt ?? p.updatedAt)}</span>
              </span>
            </Link>
            <StintPlanDuplicateButton planId={p.id} />
            {admin && <StintPlanDeleteButton planId={p.id} title={p.title} />}
          </li>
        );
      })}
    </ul>
  );
}

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
  const admin = viewer.isAdmin;

  const active = plans.filter((p) => !p.archivedAt);
  // Completed plans read as a history: newest race first.
  const completed = plans
    .filter((p) => p.archivedAt)
    .sort((a, b) => (b.archivedAt?.getTime() ?? 0) - (a.archivedAt?.getTime() ?? 0));

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Stint Planner</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">
            Fuel, stint and driver-rotation plans for iRacing Special Events.
            You see the plans you created, the ones you are driving in and the
            ones you were added to.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/stint-planner/anleitung"
            className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            📖 Anleitung (DE)
          </Link>
          <Link
            href="/stint-planner/new"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
          >
            + New plan
          </Link>
        </div>
      </div>

      {plans.length === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          No stint plans for you yet.{" "}
          <Link href="/stint-planner/new" className="text-[#ff6b35] hover:underline">
            Create the first one →
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              Active plans
              {active.length > 0 && (
                <span className="ml-2 font-normal text-zinc-600">{active.length}</span>
              )}
            </h2>
            {active.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                Nothing running right now —{" "}
                <Link href="/stint-planner/new" className="text-[#ff6b35] hover:underline">
                  start a new plan
                </Link>
                .
              </p>
            ) : (
              <PlanList plans={active} admin={admin} />
            )}
          </section>

          {completed.length > 0 && (
            <section>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Completed
                <span className="ml-2 font-normal text-zinc-600">{completed.length}</span>
              </h2>
              <p className="mb-2 text-xs text-zinc-600">
                Races that are done. The plan is read-only, the analysis stays open —
                open one and reopen it if you need to change something.
              </p>
              <PlanList plans={completed} admin={admin} dimmed />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
