/**
 * `?beforeRound=N` on the overlay API: show the season as it stood BEFORE
 * round N (round N and later left out). Used by stream overlays when a
 * broadcast is produced later from a replay of round N. Anything that is not
 * an integer >= 1 means "now" (null).
 */
export function parseBeforeRound(v: string | null): number | null {
  if (v == null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? n : null;
}
