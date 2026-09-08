"use client";

/** Shown to a signed-in CLS member who is simply not on this plan. */

import Link from "next/link";
import { useT } from "./PlannerUi";

export default function NoPlanAccess() {
  const t = useT();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold">{t.index.noAccessTitle}</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {t.index.noAccessBodyPre}{" "}
        <span className="text-zinc-300">{t.index.noAccessBox}</span>
        {t.index.noAccessBodyPost}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <Link
          href="/stint-planner"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          {t.index.backToPlans}
        </Link>
        <Link
          href="/stint-planner/new"
          className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
        >
          {t.index.newPlan}
        </Link>
      </div>
    </main>
  );
}
