"use client";

/**
 * Language (DE/EN) and Easy/Advanced switch. Lives in the planner header and
 * is the only place either preference can be changed.
 *
 * Both are rendered as two-state pill pairs rather than <select>s: there are
 * exactly two choices each, and a pill shows the current state without being
 * opened. Hidden in print — paper has no toggles.
 */

import { usePlannerUi } from "./PlannerUi";
import { LANG_LABEL, type Lang } from "@/lib/i18n/planner";
import type { PlannerMode } from "./PlannerUi";

const on = "bg-[#ff6b35] text-zinc-950";
const off = "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200";

export default function PlannerUiSwitch() {
  const { lang, setLang, mode, setMode, t } = usePlannerUi();

  return (
    <div className="flex items-center gap-2 print:hidden">
      <div
        className="flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-900 p-0.5"
        title={t.ui.language}
        aria-label={t.ui.language}
      >
        {(["de", "en"] as Lang[]).map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLang(l)}
            aria-pressed={lang === l}
            className={`rounded px-2 py-1 text-xs font-semibold transition ${
              lang === l ? on : off
            }`}
          >
            {LANG_LABEL[l]}
          </button>
        ))}
      </div>

      <div
        className="flex items-center gap-0.5 rounded border border-zinc-700 bg-zinc-900 p-0.5"
        aria-label={t.ui.mode}
      >
        {(
          [
            ["easy", t.ui.easy, t.ui.easyHint],
            ["advanced", t.ui.advanced, t.ui.advancedHint],
          ] as [PlannerMode, string, string][]
        ).map(([m, label, hint]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            title={hint}
            className={`rounded px-2.5 py-1 text-xs font-semibold transition ${
              mode === m ? on : off
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
