"use client";

/**
 * Planner-wide UI preferences: interface language and easy/advanced mode.
 *
 * WHY A MODULE STORE AND NOT A CONTEXT. There is exactly one of each setting
 * per browser tab, they change at most twice in a session, and the planner is
 * one 5.9k-line component plus half a dozen children spread over three pages.
 * A `useSyncExternalStore` on a module-level store means any of them can read
 * the preference without a provider having to be threaded around the tree —
 * and, unlike an effect that copies localStorage into state after mount, it
 * has a proper server snapshot, so React resolves the difference during
 * hydration instead of flashing.
 *
 * WHY LOCALSTORAGE AND NOT THE USER ROW. No schema change, and the choice is
 * genuinely per-device: the same person plans on a desktop and reads the plan
 * on a phone on the pit wall. Swap `load`/`persist` for a server action if it
 * should ever follow the account instead.
 */

import { useCallback, useMemo, useSyncExternalStore } from "react";
import { DICTS, DEFAULT_LANG, type Lang, type PlannerDict } from "@/lib/i18n/planner";

export type PlannerMode = "easy" | "advanced";

const LANG_KEY = "cls.planner.lang";
const MODE_KEY = "cls.planner.mode";
/** Garage 61 folded away. A per-device preference like the two above: once the
 *  pull is done the block is a wall of numbers and charts you scroll past on
 *  every visit, and whether that bothers you is a matter of how you work. */
const G61_KEY = "cls.planner.g61";

const isLang = (v: unknown): v is Lang => v === "de" || v === "en";
const isMode = (v: unknown): v is PlannerMode => v === "easy" || v === "advanced";

type Prefs = { lang: Lang; mode: PlannerMode; g61Collapsed: boolean };

/** What the server renders, and what a browser with no stored choice gets.
 *  Garage 61 starts OPEN: hiding a section nobody asked to hide is how data
 *  goes missing without anyone noticing. */
const DEFAULTS: Prefs = { lang: DEFAULT_LANG, mode: "easy", g61Collapsed: false };

let prefs: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

/**
 * Read the stored choice once, lazily. React calls this during the first
 * client render — never on the server, which gets `DEFAULTS` — so the value is
 * in place before anything paints post-hydration.
 */
function getSnapshot(): Prefs {
  if (!loaded) {
    loaded = true;
    try {
      const lang = window.localStorage.getItem(LANG_KEY);
      const mode = window.localStorage.getItem(MODE_KEY);
      const g61 = window.localStorage.getItem(G61_KEY);
      prefs = {
        lang: isLang(lang) ? lang : DEFAULTS.lang,
        mode: isMode(mode) ? mode : DEFAULTS.mode,
        g61Collapsed: g61 === "collapsed",
      };
    } catch {
      // Private mode / blocked site data — the defaults are perfectly usable.
    }
  }
  // Must be referentially stable between changes or React re-renders forever.
  return prefs;
}

const getServerSnapshot = (): Prefs => DEFAULTS;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function update(next: Partial<Prefs>) {
  prefs = { ...prefs, ...next };
  loaded = true;
  try {
    if (next.lang) window.localStorage.setItem(LANG_KEY, next.lang);
    if (next.mode) window.localStorage.setItem(MODE_KEY, next.mode);
    if (next.g61Collapsed !== undefined) {
      window.localStorage.setItem(G61_KEY, next.g61Collapsed ? "collapsed" : "open");
    }
  } catch {
    // Not worth telling the user about — the choice still holds for this tab.
  }
  for (const l of listeners) l();
}

export type PlannerUiValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** The dictionary for the active language. */
  t: PlannerDict;
  mode: PlannerMode;
  setMode: (m: PlannerMode) => void;
  /** Shorthand — `advanced` reads better than `mode === "advanced"` inline. */
  advanced: boolean;
  /** Garage 61 import + driver dashboard folded away on this device. */
  g61Collapsed: boolean;
  setG61Collapsed: (v: boolean) => void;
};

export function usePlannerUi(): PlannerUiValue {
  const { lang, mode, g61Collapsed } = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );
  const setLang = useCallback((l: Lang) => update({ lang: l }), []);
  const setMode = useCallback((m: PlannerMode) => update({ mode: m }), []);
  const setG61Collapsed = useCallback(
    (v: boolean) => update({ g61Collapsed: v }),
    []
  );
  return useMemo(
    () => ({
      lang,
      setLang,
      t: DICTS[lang],
      mode,
      setMode,
      advanced: mode === "advanced",
      g61Collapsed,
      setG61Collapsed,
    }),
    [lang, mode, g61Collapsed, setLang, setMode, setG61Collapsed]
  );
}

/** Just the dictionary — by far the most common need. */
export function useT(): PlannerDict {
  return usePlannerUi().t;
}
