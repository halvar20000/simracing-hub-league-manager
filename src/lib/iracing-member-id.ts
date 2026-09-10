/**
 * One place for "what is a valid iRacing member ID", and for cleaning up the
 * shapes people actually paste.
 *
 * `User.iracingMemberId` is a `@unique` text column holding iRacing's numeric
 * `cust_id`. Everything that matches a driver — the eventresult importer, the
 * roster, the iRating sync, Garage 61 — joins on it, so a single stray
 * character makes a driver invisible to all of them.
 *
 * Two incidents came out of not having this:
 *  - 2026-06: a transposed digit at team registration minted a second `User`
 *    for a driver who already existed; the importer then reported him as
 *    "not in the season roster".
 *  - 2026-09: two team rows were registered with a pasted `#1189750` /
 *    `#1346494` (results tables and Discord render the id with a leading
 *    hash), which the form accepted verbatim and minted drivers from.
 *
 * The rule: digits only, no leading zeros, non-empty. Punctuation and
 * whitespace around the digits are cleaned up; anything containing a letter is
 * rejected rather than guessed at, so a name typed into the ID field can never
 * be silently reduced to the digits it happens to contain.
 */

export type IracingIdParse =
  | { ok: true; id: string; cleaned: boolean }
  | { ok: false; reason: "empty" | "not-a-number"; raw: string };

/**
 * The canonical form of an iRacing member ID, or `null` when the input can't
 * be one. Strips `#`, spaces, dots, thousands separators and stray control
 * characters; drops leading zeros so `0634477` and `634477` can never become
 * two rows. Returns `null` if the value contains any letter.
 */
export function normalizeIracingId(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  // A letter means this isn't a mistyped number, it's something else
  // entirely (a name, "n/a", a URL) — don't try to salvage digits from it.
  if (/\p{L}/u.test(s)) return null;
  const digits = s.replace(/\D+/g, "");
  if (!digits) return null;
  const trimmed = digits.replace(/^0+(?=\d)/, "");
  return trimmed === "0" ? null : trimmed || null;
}

/**
 * Parse a user-supplied iRacing ID. `cleaned` is true when the stored value
 * differs from what was typed, so callers can mention it back to the user.
 */
export function parseIracingId(raw: unknown): IracingIdParse {
  const s = String(raw ?? "").trim();
  if (!s) return { ok: false, reason: "empty", raw: s };
  const id = normalizeIracingId(s);
  if (!id) return { ok: false, reason: "not-a-number", raw: s };
  return { ok: true, id, cleaned: id !== s };
}

/** True when the value is already exactly what we would store. */
export function isIracingId(raw: unknown): boolean {
  return /^[1-9]\d*$/.test(String(raw ?? ""));
}

/**
 * Human-readable reason, for form errors. `label` names the field / row so the
 * message can say which one ("Teammate row 2").
 */
export function iracingIdError(
  label: string,
  parse: Extract<IracingIdParse, { ok: false }>
): string {
  return parse.reason === "empty"
    ? `${label}: iRacing ID is required.`
    : `${label}: "${parse.raw}" is not an iRacing ID — enter the numeric customer ID only (digits, no name and no #).`;
}

/**
 * Comparison key for spotting the same human entered twice under different
 * IDs. Lower-cased, stripped of everything but letters and digits, so
 * "Sören  Schober" and "soren schober" do NOT collide (umlauts are kept as
 * themselves) while spacing and punctuation differences do not matter.
 */
export function driverNameKey(
  ...parts: (string | null | undefined)[]
): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
