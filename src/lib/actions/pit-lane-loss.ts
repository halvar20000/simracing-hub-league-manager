"use server";

import { prisma } from "@/lib/prisma";
import { gateStintPlan, getStintPlanViewer } from "@/lib/stint-plan-access";
import {
  TRACK_LANE_LOSS_KEY,
  getTrackLaneLosses,
  trackLaneLossKey,
  type TrackLaneLossMap,
} from "@/lib/pit-lane-loss";

/** Store a plan's pit lane loss as the default for its track configuration.
 *  Anyone who may open the plan may save; the last save wins. */
export async function saveTrackLaneLoss(
  planId: string | null,
  track: string,
  sec: number
): Promise<{ ok: true; map: TrackLaneLossMap } | { ok: false; error: string }> {
  if (planId) {
    const gate = await gateStintPlan(planId);
    if (!gate.ok) return { ok: false, error: gate.error };
  } else if (!(await getStintPlanViewer())) {
    return { ok: false, error: "Sign in to CLS first." };
  }
  const name = String(track ?? "").trim();
  if (!name) return { ok: false, error: "Pick a track first." };
  if (!Number.isFinite(sec) || sec <= 0 || sec > 300) {
    return { ok: false, error: "Pit lane loss must be between 0 and 300 s." };
  }
  const viewer = await getStintPlanViewer();
  const user = viewer
    ? await prisma.user.findUnique({ where: { id: viewer.userId }, select: { name: true } })
    : null;
  const map = await getTrackLaneLosses();
  map[trackLaneLossKey(name)] = {
    track: name,
    sec: Math.round(sec * 10) / 10,
    updatedAt: new Date().toISOString(),
    byName: user?.name ?? null,
  };
  const value = JSON.stringify(map);
  await prisma.appSetting.upsert({
    where: { key: TRACK_LANE_LOSS_KEY },
    create: { key: TRACK_LANE_LOSS_KEY, value },
    update: { value },
  });
  return { ok: true, map };
}
