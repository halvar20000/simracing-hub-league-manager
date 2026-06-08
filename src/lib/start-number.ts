// Start numbers are stored as text (String?) so leading zeros like "05" or
// "007" are preserved. These helpers keep sorting numeric-aware and validate
// input as digits-only.

/** Sort key: parse the numeric value, falling back to Infinity for empty/non-numeric. */
export function startNumberSortKey(s: string | null | undefined): number {
  if (s == null || s.trim() === "") return Number.POSITIVE_INFINITY;
  const n = parseInt(s, 10);
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n;
}

/** Comparator for ascending numeric-aware order (e.g. "05" < "9" < "10"). */
export function compareStartNumber(
  a: string | null | undefined,
  b: string | null | undefined,
): number {
  return startNumberSortKey(a) - startNumberSortKey(b);
}

/**
 * Normalise a raw form value into a stored start number.
 * Returns the trimmed digit string (leading zeros preserved), or null if empty.
 * Throws if it contains non-digits or is too long.
 */
export function parseStartNumberInput(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (s === "") return null;
  if (!/^\d{1,4}$/.test(s)) {
    throw new Error("Start number must be 1–4 digits (leading zeros allowed).");
  }
  return s;
}
