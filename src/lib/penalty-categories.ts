/**
 * CAS Community penalty categories.
 *
 * Levels 0–3 carry PENALTY POINTS: each scoring system stores its own
 * level→points map in `ScoringSystem.categoryPointsTable`.
 *
 * Level 4 is the SPECIAL MEASURE ("Sondermaßnahme"): it never deducts points.
 * Instead the steward types the measure as free text, stored on
 * `Penalty.specialMeasure` (penalty `type = SPECIAL_MEASURE`, no pointsValue),
 * so it stays out of the standings and the penalty pool while still being
 * published with the decision.
 */

/** Levels that carry points and get an input in the scoring-system editor. */
export const POINT_PENALTY_LEVELS = [0, 1, 2, 3] as const;

/** The points-free "special measure" level. */
export const SPECIAL_MEASURE_LEVEL = 4;

export const PENALTY_LEVELS = [0, 1, 2, 3, 4] as const;
export type PenaltyLevel = (typeof PENALTY_LEVELS)[number];

export const PENALTY_LEVEL_LABEL: Record<number, string> = {
  0: "Kategorie 0",
  1: "Kategorie 1",
  2: "Kategorie 2",
  3: "Kategorie 3",
  4: "Kategorie 4 — Sondermaßnahme",
};

/** Short label used in public listings. */
export const SPECIAL_MEASURE_LABEL = "Sondermaßnahme";

/** True for the free-text, points-free category. */
export function isSpecialMeasureLevel(
  level: number | null | undefined
): boolean {
  return level === SPECIAL_MEASURE_LEVEL;
}

export const DEFAULT_CATEGORY_POINTS: Record<string, number> = {
  "0": 0,
  "1": 2,
  "2": 4,
  "3": 8,
  // Kategorie 4 never deducts points — kept in the map so lookups by level
  // always resolve to a number.
  "4": 0,
};

/** Read the category→points map from a ScoringSystem.categoryPointsTable JSON. */
export function readCategoryPoints(
  raw: unknown
): Record<string, number> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CATEGORY_POINTS };
  const out: Record<string, number> = { ...DEFAULT_CATEGORY_POINTS };
  for (const lv of POINT_PENALTY_LEVELS) {
    const key = String(lv);
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[key] = Math.floor(v);
    }
  }
  // Level 4 is structurally points-free — never read it back from stored JSON.
  out[String(SPECIAL_MEASURE_LEVEL)] = 0;
  return out;
}

export function pointsForLevel(
  ss: { categoryPointsTable: unknown } | null | undefined,
  level: number | null | undefined
): number {
  if (level == null) return 0;
  if (isSpecialMeasureLevel(level)) return 0;
  const table = readCategoryPoints(ss?.categoryPointsTable);
  return table[String(level)] ?? 0;
}
