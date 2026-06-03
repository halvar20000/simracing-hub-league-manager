/**
 * Chart catalogue for Race Center "Data Views".
 *
 * The Prisma `RaceCenterChart.chartType` is a free-text String, so adding a
 * new chart kind here never needs a schema migration — just append a new
 * entry to the list and ship the admin/public bundle.
 *
 * The list is the source of truth for:
 *   - the admin form's chart-type dropdown
 *   - the default `title` shown above each chart card
 *   - the default `sortOrder` used when an admin uploads without setting one
 *   - the public `<RaceCenterView />` rendering order
 *
 * Order in the array == default sort order. Admins can override sortOrder
 * on a per-chart basis from the form.
 */
export const RACE_CENTER_CHART_TYPES = [
  { type: "gap", title: "Gap to Leader" },
  { type: "pace", title: "Race Pace" },
  { type: "pits", title: "Pit Stops" },
  { type: "incidents", title: "Incident Timeline" },
  { type: "positions", title: "Position Changes" },
  { type: "overtakes", title: "Overtake Net" },
  { type: "incidents-map", title: "Incident Locations" },
  { type: "pit-loss", title: "Pit Loss" },
  { type: "stint-pace", title: "Stint Pace" },
  { type: "battle", title: "Battle Proximity" },
] as const;

export type RaceCenterChartType = (typeof RACE_CENTER_CHART_TYPES)[number]["type"];

const TYPE_SET = new Set<string>(RACE_CENTER_CHART_TYPES.map((c) => c.type));

export function isValidChartType(t: string): t is RaceCenterChartType {
  return TYPE_SET.has(t);
}

export function defaultTitleForChartType(t: string): string {
  const match = RACE_CENTER_CHART_TYPES.find((c) => c.type === t);
  return match ? match.title : t;
}

export function defaultSortOrderForChartType(t: string): number {
  const idx = RACE_CENTER_CHART_TYPES.findIndex((c) => c.type === t);
  return idx >= 0 ? idx : 99;
}
