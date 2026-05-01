export interface DriverFprTier {
  /** Maximum incident count to qualify for this tier (inclusive). */
  maxInc: number;
  /** FPR points awarded for this tier. */
  points: number;
}

/**
 * Default tiers used when the scoring system has driverFprEnabled but the
 * driverFprTiers JSON isn't customised (matches CAS Combined Cup):
 *   0-2 inc → 3, 3-5 inc → 2, 6-7 inc → 1, 8+ inc → 0
 */
export const DEFAULT_DRIVER_FPR_TIERS: DriverFprTier[] = [
  { maxInc: 2, points: 3 },
  { maxInc: 5, points: 2 },
  { maxInc: 7, points: 1 },
];

export function readDriverFprTiers(raw: unknown): DriverFprTier[] {
  if (!Array.isArray(raw)) return [...DEFAULT_DRIVER_FPR_TIERS];
  const out: DriverFprTier[] = [];
  for (const t of raw) {
    if (
      t &&
      typeof t === "object" &&
      typeof (t as { maxInc?: unknown }).maxInc === "number" &&
      typeof (t as { points?: unknown }).points === "number"
    ) {
      out.push({
        maxInc: Math.max(0, Math.floor((t as DriverFprTier).maxInc)),
        points: Math.max(0, Math.floor((t as DriverFprTier).points)),
      });
    }
  }
  // Sort ascending by maxInc so the first match wins.
  out.sort((a, b) => a.maxInc - b.maxInc);
  return out.length > 0 ? out : [...DEFAULT_DRIVER_FPR_TIERS];
}

/** Map an incident count to FPR points using the supplied tiers. */
export function fprPointsForIncidents(
  incidents: number,
  tiers: DriverFprTier[]
): number {
  for (const t of tiers) {
    if (incidents <= t.maxInc) return t.points;
  }
  return 0;
}
