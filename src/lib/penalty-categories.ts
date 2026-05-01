export const PENALTY_LEVELS = [0, 1, 2, 3] as const;
export type PenaltyLevel = (typeof PENALTY_LEVELS)[number];

export const PENALTY_LEVEL_LABEL: Record<number, string> = {
  0: "Category 0 — Warning",
  1: "Category 1",
  2: "Category 2",
  3: "Category 3",
};

export const DEFAULT_CATEGORY_POINTS: Record<string, number> = {
  "0": 0,
  "1": 2,
  "2": 4,
  "3": 8,
};

/** Read the category→points map from a ScoringSystem.categoryPointsTable JSON. */
export function readCategoryPoints(
  raw: unknown
): Record<string, number> {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_CATEGORY_POINTS };
  const out: Record<string, number> = { ...DEFAULT_CATEGORY_POINTS };
  for (const lv of PENALTY_LEVELS) {
    const key = String(lv);
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v) && v >= 0) {
      out[key] = Math.floor(v);
    }
  }
  return out;
}

export function pointsForLevel(
  ss: { categoryPointsTable: unknown } | null | undefined,
  level: number | null | undefined
): number {
  if (level == null) return 0;
  const table = readCategoryPoints(ss?.categoryPointsTable);
  return table[String(level)] ?? 0;
}
