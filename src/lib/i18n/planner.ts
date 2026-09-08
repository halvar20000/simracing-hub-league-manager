/**
 * Stint-planner interface language.
 *
 * The planner is an internal tool for one endurance team, and the team speaks
 * German — so German is the default and English is the option, which is the
 * opposite of the rest of CLS. Nothing outside `/stint-planner` uses this.
 *
 * HOW IT IS TYPED. `en` is the source of truth: it is a plain object (NOT
 * `as const`, so every value widens to `string`), and `PlannerDict` is its
 * type. `de` is then annotated `: PlannerDict`, which makes the compiler
 * reject a missing, misspelt or extra key and a translation whose function
 * signature drifted from the English one. A half-translated dictionary is a
 * build error, not a runtime "undefined" on the pit wall.
 *
 * Values that need a number or a name in the middle of the sentence are
 * functions rather than placeholder strings — word order differs between the
 * two languages far more often than a `{n}` template can express.
 */

import { en } from "./planner-en";
import { de } from "./planner-de";

export type Lang = "de" | "en";
export type PlannerDict = typeof en;

export const DEFAULT_LANG: Lang = "de";

export const DICTS: Record<Lang, PlannerDict> = { en, de };

export const LANG_LABEL: Record<Lang, string> = { de: "DE", en: "EN" };

export { en, de };
