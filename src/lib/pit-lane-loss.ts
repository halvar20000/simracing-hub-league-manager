/**
 * Pit lane loss per track configuration, class-independent (Johann Solowej,
 * Nov 2026). The lane loss is mostly the track layout — pit lane length and
 * speed limit — so one averaged figure per configuration is close enough
 * (1-2 s spread between classes, lost in traffic variance). Saved from a plan
 * with "Save for future plans", pre-filled when another plan picks the track.
 *
 * One AppSetting row, no schema change. Pure read helpers — no "use server".
 */
import { prisma } from "@/lib/prisma";

export const TRACK_LANE_LOSS_KEY = "pit-lane-loss:tracks";

export type TrackLaneLoss = {
  track: string; // display name incl. configuration, as the planner shows it
  sec: number;
  updatedAt: string; // ISO
  byName: string | null;
};

/** Keyed by `trackLaneLossKey(track)`. */
export type TrackLaneLossMap = Record<string, TrackLaneLoss>;

/** Configuration matters ("Road Atlanta — Full Course" ≠ "— Short"), so the
 *  whole display string is the key, normalised for case and punctuation. */
export function trackLaneLossKey(track: string): string {
  return String(track ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export async function getTrackLaneLosses(): Promise<TrackLaneLossMap> {
  const row = await prisma.appSetting.findUnique({
    where: { key: TRACK_LANE_LOSS_KEY },
  });
  if (!row) return {};
  try {
    const v = JSON.parse(row.value);
    return v && typeof v === "object" ? (v as TrackLaneLossMap) : {};
  } catch {
    return {};
  }
}
