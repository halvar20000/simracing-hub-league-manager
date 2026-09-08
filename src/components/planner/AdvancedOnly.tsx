"use client";

/**
 * Wraps a block that only exists in Advanced mode.
 *
 * The point of Easy mode is to shorten the page, not to change the plan: what
 * is hidden keeps computing exactly as before. That makes one case worth
 * calling out — a hidden block that is CURRENTLY DOING SOMETHING. Pass
 * `activeNote` and Easy mode leaves a single quiet line behind saying so, with
 * a button that switches to Advanced. Without it a team could stare at a
 * schedule built on the detailed pit model with no clue where the numbers came
 * from.
 *
 * Printing always includes the block: paper is the pit-wall copy and must be
 * complete regardless of which mode the browser happened to be in.
 */

import { usePlannerUi } from "./PlannerUi";

export default function AdvancedOnly({
  children,
  activeNote,
  className = "",
}: {
  children: React.ReactNode;
  /** Shown in Easy mode only when the hidden block is actually in effect. */
  activeNote?: string | null;
  className?: string;
}) {
  const { advanced, setMode, t } = usePlannerUi();

  if (advanced) return <>{children}</>;

  return (
    <>
      <div className="hidden print:block">{children}</div>
      {activeNote && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-xs text-zinc-400 print:hidden ${className}`}
        >
          <span>{activeNote}</span>
          <button
            type="button"
            onClick={() => setMode("advanced")}
            className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 font-semibold text-zinc-300 hover:bg-zinc-800"
          >
            {t.ui.showAdvanced}
          </button>
        </div>
      )}
    </>
  );
}
