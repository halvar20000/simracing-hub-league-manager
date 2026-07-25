"use server";

import { put } from "@vercel/blob";
import { parseRaceLog } from "@/lib/race-log-pace";
import type { PlannerRaceLog } from "@/lib/stint-plan-state";

// Upload the race-logger JSONL for a stint plan: archive the raw log on Vercel
// Blob and return the measured pace + stint summary. The planner client stores
// the result in the plan payload (auto-saved like every other edit).

/** Server Actions cap the request body at 25 MB (next.config.ts). */
const MAX_LOG_BYTES = 20 * 1024 * 1024;

export type UploadRaceLogResult =
  | { ok: true; log: Omit<PlannerRaceLog, "parsedAt">; ownCarNumber: string | null }
  | { ok: false; error: string };

export async function uploadStintPlanRaceLog(
  formData: FormData
): Promise<UploadRaceLogResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  if (file.size > MAX_LOG_BYTES) {
    return {
      ok: false,
      error: `Log too large (${(file.size / 1024 / 1024).toFixed(1)} MB, max 20 MB).`,
    };
  }

  const rosterRaw = formData.get("roster");
  let roster: string[] = [];
  if (typeof rosterRaw === "string" && rosterRaw.trim() !== "") {
    try {
      roster = (JSON.parse(rosterRaw) as unknown[]).filter(
        (n): n is string => typeof n === "string"
      );
    } catch {
      // roster is a nicety — never fail the upload over it
    }
  }

  const text = await file.text();
  const parsed = parseRaceLog(text, roster);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Could not read the race log: ${parsed.error ?? "unknown format"}.`,
    };
  }

  let url: string;
  try {
    const blob = await put(`stint-planner/racelog/${file.name}`, text, {
      access: "public",
      contentType: "application/x-ndjson",
      addRandomSuffix: true,
    });
    url = blob.url;
  } catch {
    return { ok: false, error: "Upload failed — please try again." };
  }

  return {
    ok: true,
    ownCarNumber: parsed.ownCarNumber,
    log: {
      url,
      name: file.name,
      track: parsed.track,
      sessionName: parsed.sessionName,
      official: parsed.official,
      trackTempC: parsed.trackTempC,
      airTempC: parsed.airTempC,
      ownCarNumber: parsed.ownCarNumber,
      ownCarClass: parsed.ownCarClass,
      classBestSec: parsed.classBestSec,
      fieldBestSec: parsed.fieldBestSec,
      drivers: parsed.drivers,
      laps: parsed.laps,
      stints: parsed.stints,
    },
  };
}
