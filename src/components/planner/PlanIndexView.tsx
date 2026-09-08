"use client";

/**
 * The plan list at /stint-planner.
 *
 * A client component only so it can be translated — the language lives in the
 * browser, and a Server Component cannot read it. The page still does all the
 * querying and access filtering on the server and hands the rows down already
 * reduced to what the list shows.
 */

import Link from "next/link";
import { formatDateTime } from "@/lib/date";
import StintPlanDuplicateButton from "@/components/StintPlanDuplicateButton";
import StintPlanDeleteButton from "@/components/StintPlanDeleteButton";
import PlannerUiSwitch from "./PlannerUiSwitch";
import { useT } from "./PlannerUi";

export type PlanListRow = {
  id: string;
  title: string;
  /** ms since epoch — Dates do not survive the server/client boundary well. */
  stampMs: number;
  archived: boolean;
  track: string | null;
  duration: string | null;
  driverCount: number | null;
};

function PlanList({
  plans,
  admin,
  dimmed = false,
}: {
  plans: PlanListRow[];
  admin: boolean;
  dimmed?: boolean;
}) {
  const t = useT();
  return (
    <ul className="divide-y divide-zinc-800 overflow-hidden rounded-lg border border-zinc-800">
      {plans.map((p) => (
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
              {p.track && <span className="ml-2 text-xs text-zinc-500">{p.track}</span>}
              {p.archived && (
                <span className="ml-2 rounded border border-zinc-700 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                  {t.index.completedBadge}
                </span>
              )}
            </span>
            <span className="flex items-center gap-3 text-xs text-zinc-500">
              {p.duration && <span>{p.duration}</span>}
              {p.driverCount != null && <span>{t.index.driverCount(p.driverCount)}</span>}
              <span>{formatDateTime(new Date(p.stampMs))}</span>
            </span>
          </Link>
          <StintPlanDuplicateButton planId={p.id} />
          {admin && <StintPlanDeleteButton planId={p.id} title={p.title} />}
        </li>
      ))}
    </ul>
  );
}

export default function PlanIndexView({
  active,
  completed,
  admin,
}: {
  active: PlanListRow[];
  completed: PlanListRow[];
  admin: boolean;
}) {
  const t = useT();
  const total = active.length + completed.length;

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t.index.title}</h1>
          <p className="mt-1 max-w-xl text-sm text-zinc-400">{t.index.lead}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PlannerUiSwitch />
          <Link
            href="/stint-planner/anleitung"
            className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {t.index.guide}
          </Link>
          <Link
            href="/stint-planner/new"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
          >
            {t.index.newPlan}
          </Link>
        </div>
      </div>

      {total === 0 ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-8 text-center text-sm text-zinc-400">
          {t.index.emptyPre}{" "}
          <Link href="/stint-planner/new" className="text-[#ff6b35] hover:underline">
            {t.index.emptyLink}
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              {t.index.activeTitle}
              {active.length > 0 && (
                <span className="ml-2 font-normal text-zinc-600">{active.length}</span>
              )}
            </h2>
            {active.length === 0 ? (
              <p className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
                {t.index.activeEmptyPre}{" "}
                <Link href="/stint-planner/new" className="text-[#ff6b35] hover:underline">
                  {t.index.activeEmptyLink}
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
                {t.index.completedTitle}
                <span className="ml-2 font-normal text-zinc-600">{completed.length}</span>
              </h2>
              <p className="mb-2 text-xs text-zinc-600">{t.index.completedLead}</p>
              <PlanList plans={completed} admin={admin} dimmed />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
