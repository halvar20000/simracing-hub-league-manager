import { prisma } from "@/lib/prisma";
import type { TrackOption } from "@/components/TrackSelect";

/**
 * Server-side loader: read every cached iRacing track variant and group
 * them by track name into the shape TrackSelect expects.
 *
 * Returns [] if the cache is empty — the typeahead degrades to plain
 * free-text input in that case.
 */
export async function loadIracingTrackOptions(): Promise<TrackOption[]> {
  const rows = await prisma.iracingTrack.findMany({
    orderBy: [{ trackName: "asc" }, { configName: "asc" }],
    select: { trackName: true, configName: true },
  });

  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    const bucket = map.get(r.trackName) ?? new Set<string>();
    bucket.add(r.configName ?? "");
    map.set(r.trackName, bucket);
  }

  return [...map.entries()]
    .map(([trackName, configs]) => ({
      trackName,
      configs: [...configs],
    }))
    .sort((a, b) => a.trackName.localeCompare(b.trackName));
}
