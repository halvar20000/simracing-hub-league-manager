import { prisma } from "@/lib/prisma";

export type ClsCarOption = { name: string; iracingCarId: number | null };

/** Distinct track names raced across CLS (track + optional config), for the
 *  stint planner's track picker. Sorted alphabetically. */
export async function getClsTracks(): Promise<string[]> {
  const rows = await prisma.round.findMany({
    select: { track: true, trackConfig: true },
    distinct: ["track", "trackConfig"],
  });
  const set = new Set<string>();
  for (const r of rows) {
    const t = (r.track ?? "").trim();
    if (!t) continue;
    const cfg = (r.trackConfig ?? "").trim();
    set.add(cfg ? `${t} — ${cfg}` : t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Distinct cars known to CLS (by name), carrying the iRacing car id where set
 *  (used later for the Garage 61 lap-data lookup). Sorted by name. */
export async function getClsCars(): Promise<ClsCarOption[]> {
  const cars = await prisma.car.findMany({
    select: { name: true, iracingCarId: true },
    orderBy: { name: "asc" },
  });
  const byName = new Map<string, number | null>();
  for (const c of cars) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    if (!byName.has(name) || (byName.get(name) == null && c.iracingCarId != null)) {
      byName.set(name, c.iracingCarId ?? null);
    }
  }
  return [...byName.entries()]
    .map(([name, iracingCarId]) => ({ name, iracingCarId }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
