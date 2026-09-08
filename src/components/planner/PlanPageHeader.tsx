"use client";

/**
 * The heading strip above a stint plan (back link, title, one-line lead and,
 * on a saved plan, the debrief link). A client component purely so it can be
 * translated — the language preference lives in the browser.
 */

import Link from "next/link";
import { useT } from "./PlannerUi";

export default function PlanPageHeader({
  variant,
  debriefHref,
  archived = false,
}: {
  variant: "new" | "plan";
  /** Set on a saved plan that already has a race log to brief on. */
  debriefHref?: string | null;
  archived?: boolean;
}) {
  const t = useT();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link href="/stint-planner" className="text-zinc-400 hover:text-[#ff6b35]">
          {t.page.allPlans}
        </Link>
        {debriefHref && (
          <Link
            href={debriefHref}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
          >
            {t.page.debriefLink}
          </Link>
        )}
      </div>
      <h1 className="mb-1 text-2xl font-bold">
        {variant === "new" ? t.page.newTitle : t.page.planTitle}
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        {variant === "new"
          ? t.page.newLead
          : archived
            ? t.page.planLeadArchived
            : t.page.planLeadLive}
      </p>
    </>
  );
}
