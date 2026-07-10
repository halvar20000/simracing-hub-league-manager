import { prisma } from "@/lib/prisma";

export type ClsCarOption = { name: string; iracingCarId: number | null };

/** Every iRacing track variant CLS knows about (the synced iRacing catalog —
 *  not just tracks CLS has raced), as "Track — Config" display strings.
 *  Deduplicated by label and sorted. */
export async function getClsTracks(): Promise<string[]> {
  const rows = await prisma.iracingTrack.findMany({
    select: { trackName: true, configName: true },
    orderBy: [{ trackName: "asc" }, { configName: "asc" }],
  });
  const set = new Set<string>();
  for (const r of rows) {
    const t = (r.trackName ?? "").trim();
    if (!t) continue;
    const cfg = (r.configName ?? "").trim();
    set.add(cfg ? `${t} — ${cfg}` : t);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Every iRacing car CLS knows about (the synced iRacing catalog), carrying the
 *  real iRacing car id for the later Garage 61 lap-data lookup. Sorted by name. */
export async function getClsCars(): Promise<ClsCarOption[]> {
  const cars = await prisma.iracingCar.findMany({
    select: { name: true, iracingCarId: true },
    orderBy: { name: "asc" },
  });
  const byName = new Map<string, number | null>();
  for (const c of cars) {
    const name = (c.name ?? "").trim();
    if (!name) continue;
    if (!byName.has(name)) byName.set(name, c.iracingCarId ?? null);
  }
  return [...byName.entries()]
    .map(([name, iracingCarId]) => ({ name, iracingCarId }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
