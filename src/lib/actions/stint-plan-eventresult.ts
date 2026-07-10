"use server";

import { put } from "@vercel/blob";
import { parseIracingEventJson } from "@/lib/iracing-json";
import type { ResultRow } from "@/lib/stint-plan-state";

// Upload an end-of-session iRacing eventresult.json for a stint plan: archive
// the raw file on Vercel Blob and return a parsed finishing-order summary. The
// caller (planner client) stores the url + name + summary in the plan payload
// and persists it with the normal Save. No DB write here.

export type UploadEventResultResult =
  | {
      ok: true;
      url: string;
      name: string;
      summary: ResultRow[];
      track: string | null;
    }
  | { ok: false; error: string };

export async function uploadStintPlanEventResult(
  formData: FormData
): Promise<UploadEventResultResult> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  const text = await file.text();

  let parsed;
  try {
    parsed = parseIracingEventJson(JSON.parse(text));
  } catch {
    return {
      ok: false,
      error: "That doesn't look like an iRacing eventresult.json.",
    };
  }

  // Prefer the RACE session; fall back to the last session.
  const race =
    parsed.sessions.find((s) => s.kind === "RACE") ??
    parsed.sessions[parsed.sessions.length - 1];

  const summary: ResultRow[] = (race?.drivers ?? [])
    .slice()
    .sort((a, b) => a.finishPosition - b.finishPosition)
    .map((d) => ({
      pos: d.finishStatus === "CLASSIFIED" ? d.finishPosition : null,
      status: d.finishStatus,
      name: d.displayName,
      carNumber: d.carNumber,
      car: d.carName,
      laps: d.lapsComplete,
      incidents: d.incidents,
    }));

  let url: string;
  try {
    const blob = await put(`stint-planner/eventresult/${file.name}`, text, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: true,
    });
    url = blob.url;
  } catch {
    return { ok: false, error: "Upload failed — please try again." };
  }

  return { ok: true, url, name: file.name, summary, track: parsed.trackName };
}
