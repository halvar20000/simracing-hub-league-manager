"use server";

import { put } from "@vercel/blob";
import { requireSignedInViewer } from "@/lib/stint-plan-access";
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

/**
 * Re-run the parser over a log that is already archived on Blob.
 *
 * A log parsed by an older build can be missing fields the dashboard needs
 * (lap timestamps, added in v1.60.0, are what lets a stint be matched to the
 * plan's driver order). The raw file is still on Blob, so re-analysing it beats
 * asking the team to dig the .jsonl out again.
 */
export async function reparseStintPlanRaceLog(
  url: string,
  name: string,
  rosterJson: string
): Promise<UploadRaceLogResult> {
  // Signed-in-only: this reads from / writes to the league's Blob store.
  const signedIn = await requireSignedInViewer();
  if (!signedIn.ok) return { ok: false, error: signedIn.error };

  if (!/^https:\/\/[a-z0-9.-]+\.public\.blob\.vercel-storage\.com\//i.test(url)) {
    return { ok: false, error: "That log is not in this site's archive." };
  }
  let text: string;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return { ok: false, error: "Could not read the archived log." };
    text = await res.text();
  } catch {
    return { ok: false, error: "Could not read the archived log." };
  }

  let roster: string[] = [];
  try {
    roster = (JSON.parse(rosterJson || "[]") as unknown[]).filter(
      (n): n is string => typeof n === "string"
    );
  } catch {
    // roster is a nicety — never fail over it
  }

  const parsed = parseRaceLog(text, roster);
  if (!parsed.ok) {
    return {
      ok: false,
      error: `Could not read the race log: ${parsed.error ?? "unknown format"}.`,
    };
  }
  return {
    ok: true,
    ownCarNumber: parsed.ownCarNumber,
    log: {
      url,
      name,
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
      temps: parsed.temps,
      exclV: parsed.exclV,
    },
  };
}

export async function uploadStintPlanRaceLog(
  formData: FormData
): Promise<UploadRaceLogResult> {
  // Signed-in-only: this reads from / writes to the league's Blob store.
  const signedIn = await requireSignedInViewer();
  if (!signedIn.ok) return { ok: false, error: signedIn.error };

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
      temps: parsed.temps,
      exclV: parsed.exclV,
    },
  };
}
