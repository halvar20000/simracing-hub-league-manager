"use server";

import { put } from "@vercel/blob";
import { requireSignedInViewer } from "@/lib/stint-plan-access";
import { parseIracingEventJson, IracingJsonParseError } from "@/lib/iracing-json";
import type { ResultRow, TeamDriverStat } from "@/lib/stint-plan-state";

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
      /** True when the file is a team event (one row per TEAM, not per driver). */
      teamEvent: boolean;
      /** Our own entry's drivers as iRacing scored them, when identified. */
      ownDrivers: TeamDriverStat[];
      ownCarNumber: string | null;
    }
  | { ok: false; error: string };

const norm = (s: string) => s.trim().toLowerCase();

export async function uploadStintPlanEventResult(
  formData: FormData
): Promise<UploadEventResultResult> {
  // Uploads land in the league's Blob store, so this is signed-in-only. It is
  // deliberately not plan-scoped: the file is only attached to a plan by the
  // save that follows, and that save is gated.
  const signedIn = await requireSignedInViewer();
  if (!signedIn.ok) return { ok: false, error: signedIn.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No file selected." };
  }
  // The plan's roster, so the team's own row can be highlighted.
  const rosterRaw = formData.get("roster");
  let roster = new Set<string>();
  if (typeof rosterRaw === "string" && rosterRaw.trim() !== "") {
    try {
      roster = new Set(
        (JSON.parse(rosterRaw) as unknown[])
          .filter((n): n is string => typeof n === "string" && n.trim() !== "")
          .map(norm)
      );
    } catch {
      // roster is a nicety — never fail the upload over it
    }
  }

  const text = await file.text();

  let parsed;
  try {
    parsed = parseIracingEventJson(JSON.parse(text));
  } catch (e) {
    return {
      ok: false,
      error:
        e instanceof IracingJsonParseError
          ? e.message
          : "That doesn't look like an iRacing eventresult.json.",
    };
  }

  // Prefer the RACE session; fall back to the last session.
  const race =
    parsed.sessions.find((s) => s.kind === "RACE") ??
    parsed.sessions[parsed.sessions.length - 1];

  // Team events (endurance): one row per TEAM with its driver line-up, not one
  // row per driver stint — otherwise a 6h race lists every driver twice.
  const teamEvent = (race?.teams.length ?? 0) > 0;
  const summary: ResultRow[] = teamEvent
    ? (race?.teams ?? [])
        .slice()
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map((t) => ({
          pos: t.finishStatus === "CLASSIFIED" ? t.finishPosition : null,
          status: t.finishStatus,
          name: t.displayName,
          carNumber: t.carNumber,
          car: t.carName,
          laps: t.lapsComplete,
          incidents: t.incidents,
          carClass: t.carClassShortName,
          classPos: t.finishStatus === "CLASSIFIED" ? t.classPosition : null,
          drivers: t.driverNames,
          bestLapMs: t.bestLapMs,
          own: t.driverNames.some((n) => roster.has(norm(n))),
        }))
    : (race?.drivers ?? [])
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
          carClass: d.carClassShortName,
          classPos: null,
          bestLapMs: d.bestLapMs,
          own: roster.has(norm(d.displayName)),
        }));

  // Our own entry: the drivers iRacing scored for the team row we matched.
  // This is the authoritative per-driver split for a team race — the race
  // logger only ever reports one driver name per car.
  const ownTeam = (race?.teams ?? []).find((t) =>
    t.driverNames.some((n) => roster.has(norm(n)))
  );
  const ownDrivers: TeamDriverStat[] = ownTeam
    ? (race?.drivers ?? [])
        .filter((d) => ownTeam.driverCustIds.includes(d.custId))
        .map((d) => ({
          name: d.displayName,
          custId: d.custId,
          laps: d.lapsComplete,
          bestSec: d.bestLapMs == null ? null : d.bestLapMs / 1000,
          bestLapNum: d.bestLapNum,
          avgSec: d.avgLapMs == null ? null : d.avgLapMs / 1000,
          incidents: d.incidents,
        }))
        .sort((a, b) => b.laps - a.laps)
    : [];

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

  return {
    ok: true,
    url,
    name: file.name,
    summary,
    track: parsed.trackName,
    teamEvent,
    ownDrivers,
    ownCarNumber: ownTeam?.carNumber ?? null,
  };
}
