"use client";

/**
 * Numbers that are legal but look wrong.
 *
 * The planner accepts whatever is typed and computes from it, which is the
 * right behaviour — a team knows its own car better than a validator does.
 * The failure mode that costs a race is the SILENT one: a lap time entered as
 * "118.8" instead of "1:58.8" produces a perfectly plausible-looking schedule
 * with twice the stints in it, and nothing on the page says so.
 *
 * So: never block, never correct, just say what looks odd and why. An empty
 * list renders nothing at all.
 */

import { useT } from "./PlannerUi";

export default function PlanWarnings({ items }: { items: string[] }) {
  const t = useT();
  if (items.length === 0) return null;
  return (
    <div className="rounded-lg border border-amber-800/50 bg-amber-950/20 p-4 print:hidden">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-amber-300">
        {t.warn.title}
      </h2>
      <p className="mt-1 text-xs text-amber-200/60">{t.warn.lead}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-100">
        {items.map((w) => (
          <li key={w}>{w}</li>
        ))}
      </ul>
    </div>
  );
}
