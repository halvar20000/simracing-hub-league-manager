/**
 * Which leagues offer the .xlsx standings export.
 *
 * Kept in its own tiny module so both the public standings page (to decide
 * whether to render the download button) and the API route (to authorise the
 * request) import the same list — the page must never advertise an export the
 * route would reject.
 *
 * The exporter itself is league-agnostic; add a slug here to roll it out.
 */
export const STANDINGS_EXPORT_SLUGS = new Set<string>(["cas-gt3-wct"]);

export function isStandingsExportEnabled(slug: string): boolean {
  return STANDINGS_EXPORT_SLUGS.has(slug);
}
