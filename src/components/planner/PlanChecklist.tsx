"use client";

/**
 * "What is this plan still missing?"
 *
 * The schedule is the first thing on the page, which is right once a plan is
 * built and useless while it is being built: a new plan opens on an empty
 * table under the sentence "enter a race duration, lap time, fuel per lap and
 * tank size", with nine cards below it and no stated order. This turns that
 * one sentence into a live list — each step ticks itself off as it is filled
 * in, and clicking a missing one scrolls to the card that owns it.
 *
 * It disappears the moment everything is filled in. A checklist that stays on
 * screen after it is finished is just noise on the pit wall.
 */

import { usePlannerUi } from "./PlannerUi";

export type ChecklistItem = {
  key: string;
  label: string;
  /** id of the card this step lives in, for the jump link. */
  anchor?: string;
  done: boolean;
};

export default function PlanChecklist({ items }: { items: ChecklistItem[] }) {
  const { t } = usePlannerUi();
  const open = items.filter((i) => !i.done);
  if (open.length === 0) return null;

  const jump = (anchor?: string) => {
    if (!anchor) return;
    document
      .getElementById(anchor)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 print:hidden">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
        {t.checklist.title}
      </h2>
      <p className="mt-1 text-xs text-amber-200/70">
        {t.checklist.lead(open.length, items.length)}
      </p>
      <ol className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {items.map((it, i) => (
          <li key={it.key} className="flex items-center gap-1.5 text-sm">
            <span
              className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                it.done
                  ? "bg-emerald-500/20 text-emerald-300"
                  : "bg-amber-500/20 text-amber-300"
              }`}
            >
              {it.done ? "✓" : i + 1}
            </span>
            {it.done ? (
              <span className="text-zinc-500 line-through decoration-zinc-700">
                {it.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => jump(it.anchor)}
                className="text-amber-100 underline decoration-amber-500/40 underline-offset-2 hover:decoration-amber-300"
              >
                {it.label}
              </button>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
