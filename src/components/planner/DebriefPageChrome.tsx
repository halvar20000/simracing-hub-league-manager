"use client";

/**
 * The two bits of the debrief page that live outside <DebriefView>: the back
 * link, and the screen shown when there is nothing to brief on yet. Client
 * components only so they follow the language switch like everything else.
 */

import Link from "next/link";
import { useT } from "./PlannerUi";

export function DebriefBackLink({ planId }: { planId: string }) {
  const t = useT();
  return (
    <div className="mb-4 text-sm print:hidden">
      <Link
        href={`/stint-planner/${planId}`}
        className="text-zinc-400 hover:text-[#ff6b35]"
      >
        {t.dbfPage.backToPlan}
      </Link>
    </div>
  );
}

export function NoDebriefYet({
  planId,
  planTitle,
}: {
  planId: string;
  planTitle: string;
}) {
  const t = useT();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold">{t.dbfPage.noneTitle}</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {t.dbfPage.noneBodyPre} <span className="text-zinc-200">{planTitle}</span>{" "}
        {t.dbfPage.noneBodyMid} <span className="font-mono">.jsonl</span>{" "}
        {t.dbfPage.noneBodyMid2}{" "}
        <span className="font-mono">eventresult.json</span>{" "}
        {t.dbfPage.noneBodyPost}
      </p>
      <Link
        href={`/stint-planner/${planId}`}
        className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
      >
        {t.dbfPage.toPlan}
      </Link>
    </main>
  );
}

/** The debrief exists, but this viewer is not on the plan it belongs to. */
export function NoDebriefAccess() {
  const t = useT();
  return (
    <main className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="mb-3 text-2xl font-bold">{t.dbfPage.noAccessTitle}</h1>
      <p className="mb-6 text-sm text-zinc-400">{t.dbfPage.noAccessBody}</p>
      <Link
        href="/stint-planner"
        className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
      >
        {t.index.backToPlans}
      </Link>
    </main>
  );
}
