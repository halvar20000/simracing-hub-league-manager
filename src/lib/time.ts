/**
 * Parse a time string into milliseconds.
 * Accepts:
 *   - "63.456"       → 63456
 *   - "1:03.456"     → 63456
 *   - "1:23:45.678"  → 5025678
 *   - empty / null   → null
 */
export function parseTimeToMs(input: string | null | undefined): number | null {
  if (input == null) return null;
  const t = input.trim();
  if (!t) return null;

  const parts = t.split(":");
  let seconds = 0;

  if (parts.length === 1) {
    seconds = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(s)) return null;
    seconds = m * 60 + s;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
    seconds = h * 3600 + m * 60 + s;
  } else {
    return null;
  }

  if (Number.isNaN(seconds)) return null;
  return Math.round(seconds * 1000);
}

/**
 * Format milliseconds to "M:SS.mmm" (or "H:MM:SS.mmm" if >= 1 hour).
 * Returns "" for null/undefined.
 */
export function formatMsToTime(
  ms: number | null | undefined
): string {
  if (ms == null) return "";

  const totalSec = ms / 1000;
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const ssStr = ss.toFixed(3).padStart(6, "0");

  if (hh > 0) {
    return `${hh}:${String(mm).padStart(2, "0")}:${ssStr}`;
  }
  return `${mm}:${ssStr}`;
}
