"use server";

import { prisma } from "@/lib/prisma";
import {
  g61GetMe,
  g61ListTracks,
  g61ListCars,
  g61FindLaps,
  type G61Track,
  type G61Car,
  type G61Lap,
} from "@/lib/garage61";
import {
  aggregateGarage61Laps,
  type G61ImportResult,
  type G61LapRow,
} from "@/lib/garage61-import";
import { resolvePlanGarage61 } from "@/lib/garage61-plan-token";

// Live Garage 61 pull for the stint planner. Given the selected CLS track + car
// (the car carries its iRacing id), resolve the matching Garage 61 track/car,
// fetch the team's laps, aggregate them into per-driver race pace + fuel/lap,
// and hand back the same G61ImportResult the .xlsx upload path produces so the
// planner UI can reuse its table + "Apply to plan" flow. Read-only; no DB write.

export type PullGarage61Result =
  | {
      ok: true;
      result: G61ImportResult;
      meta: {
        trackMatched: string | null;
        carMatched: string | null;
        teams: string[];
        lapsFetched: number;
        /** Laps dropped because they were older than the chosen window. */
        lapsTooOld: number;
        /** Window that was asked for, as a label ("current season", "90 days"). */
        window: string;
        /** Oldest / newest lap actually used (ms since epoch), when dated. */
        oldestLapMs: number | null;
        newestLapMs: number | null;
        /** True when the laps carry no usable date, so only the API-side age
         *  filter applied — worth saying out loud rather than pretending. */
        datesMissing: boolean;
        // Field names on the first raw lap — lets us confirm the live shape
        // (esp. the fuel-used key) on the very first pull without guessing.
        sampleLapKeys: string[];
      };
    }
  | { ok: false; error: string };

const norm = (x: string): string =>
  x
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Read the first present numeric field from a set of candidate keys on a loose
// object (the Garage 61 lap passthrough is untyped). Returns null if none set.
function pickNum(o: Record<string, unknown>, keys: string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && isFinite(v)) return v;
    if (typeof v === "string" && v.trim() !== "" && isFinite(Number(v)))
      return Number(v);
  }
  return null;
}

/** When the lap was driven, in ms. Garage 61 has changed this key before, so
 *  several spellings are tried and anything unparseable is simply "unknown". */
function pickDateMs(o: Record<string, unknown>): number | null {
  const keys = [
    "startTime",
    "start_time",
    "endTime",
    "end_time",
    "date",
    "createdAt",
    "created_at",
    "sessionStart",
    "session_start",
    "time",
  ];
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim() !== "") {
      const t = Date.parse(v);
      if (isFinite(t)) return t;
    }
    // A bare number is only a date when it is plausibly one (ms or s epoch).
    if (typeof v === "number" && isFinite(v)) {
      if (v > 1e12 && v < 4e12) return v;
      if (v > 1e9 && v < 4e9) return v * 1000;
    }
  }
  return null;
}

// Human label for the age code, for the "pulled N laps" message. NOT exported:
// a "use server" file may only export async functions (tsc allows it, Turbopack
// rejects the build — see CLAUDE.md).
function windowLabel(age: number | null): string {
  if (age == null) return "all data";
  if (age === -1) return "current season";
  if (age === -2) return "current + previous season";
  if (age < 0) return `last ${Math.abs(age)} seasons`;
  return `last ${age} days`;
}

function pickBool(o: Record<string, unknown>, keys: string[]): boolean {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v === 1;
  }
  return false;
}

// A Garage 61 track/car may expose the underlying iRacing id under a few names.
function platformId(o: Record<string, unknown>): string | null {
  const raw =
    o["platform_id"] ?? o["platformId"] ?? o["iracingId"] ?? o["iracing_id"];
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  return s === "" ? null : s;
}

// "Track — Config" (getClsTracks display string) → {trackName, configName}.
function splitTrackLabel(label: string): {
  trackName: string;
  configName: string | null;
} {
  const parts = label.split(/\s+—\s+/);
  if (parts.length >= 2) {
    return { trackName: parts[0].trim(), configName: parts.slice(1).join(" — ").trim() };
  }
  return { trackName: label.trim(), configName: null };
}

function matchTrack(
  g61Tracks: G61Track[],
  label: string,
  iracingTrackId: number | null
): G61Track | null {
  if (iracingTrackId != null) {
    const byId = g61Tracks.find(
      (t) => platformId(t as unknown as Record<string, unknown>) === String(iracingTrackId)
    );
    if (byId) return byId;
  }
  const { trackName, configName } = splitTrackLabel(label);
  const wantName = norm(trackName);
  const wantVariant = configName ? norm(configName) : "";
  // Prefer an exact name + variant match, then name-only.
  const withVariant = g61Tracks.find((t) => {
    const n = norm(t.name);
    const v = norm(t.variant ?? "");
    return n === wantName && (wantVariant === "" || v === wantVariant);
  });
  if (withVariant) return withVariant;
  return g61Tracks.find((t) => norm(t.name) === wantName) ?? null;
}

function matchCar(
  g61Cars: G61Car[],
  carName: string,
  iracingCarId: number | null
): G61Car | null {
  if (iracingCarId != null) {
    const byId = g61Cars.find(
      (c) => platformId(c as unknown as Record<string, unknown>) === String(iracingCarId)
    );
    if (byId) return byId;
  }
  const want = norm(carName);
  return g61Cars.find((c) => norm(c.name) === want) ?? null;
}

function lapDriverName(lap: G61Lap): string {
  const d = lap.driver;
  if (!d) return "";
  const parts = [d.firstName ?? "", d.lastName ?? ""].map((x) => x.trim());
  const full = parts.filter(Boolean).join(" ").trim();
  return full || (d.slug ?? "");
}

export async function pullGarage61Laps(input: {
  planId?: string | null;
  track: string;
  carName: string;
  iracingCarId: number | null;
  /** Roster driver names to scope the import to (empty = include everyone). */
  rosterNames?: string[];
  /** How far back to look. Garage 61's own codes: -1 = current season,
   *  -2 = current + previous, a positive number = that many days.
   *  Null/undefined = no limit (everything Garage 61 has). */
  age?: number | null;
}): Promise<PullGarage61Result> {
  // Prefer this plan's own token; fall back to the global GARAGE61_TOKEN.
  const conn = await resolvePlanGarage61(input.planId ?? null);
  if (!conn.token) {
    return {
      ok: false,
      error:
        "No Garage 61 token available — connect this plan to Garage 61 (or set the global GARAGE61_TOKEN).",
    };
  }
  const tk = conn.token;
  const track = (input.track ?? "").trim();
  const carName = (input.carName ?? "").trim();
  if (!track) return { ok: false, error: "Pick a track first." };

  // Who are we + which teams' laps may we read.
  const me = await g61GetMe(tk);
  if (!me.ok) {
    return {
      ok: false,
      error:
        me.status === 401 || me.status === 403
          ? "Garage 61 rejected the token (check it and its permissions)."
          : `Garage 61 /me failed (${me.status}): ${me.error}`,
    };
  }
  // Scope to the plan's chosen team if set, else every team the token can see.
  const teams = conn.teamSlug
    ? [conn.teamSlug]
    : (me.data.teams ?? []).map((t) => t.slug).filter(Boolean);

  // Resolve the CLS track → Garage 61 track id (by iRacing id, then by name).
  const { trackName, configName } = splitTrackLabel(track);
  const dbTrack = await prisma.iracingTrack.findFirst({
    where: configName
      ? { trackName, configName }
      : { trackName, configName: null },
    select: { iracingTrackId: true },
  });
  const iracingTrackId = dbTrack?.iracingTrackId ?? null;

  const tracksRes = await g61ListTracks(tk);
  if (!tracksRes.ok) {
    return { ok: false, error: `Garage 61 /tracks failed (${tracksRes.status}).` };
  }
  const g61Track = matchTrack(tracksRes.data.items ?? [], track, iracingTrackId);
  if (!g61Track) {
    return {
      ok: false,
      error: `No Garage 61 track matched "${track}". Check the track name or that laps exist for it.`,
    };
  }

  // Resolve the CLS car → Garage 61 car id (optional filter; skipped if unmatched).
  let g61Car: G61Car | null = null;
  if (carName) {
    const carsRes = await g61ListCars(tk);
    if (carsRes.ok) {
      g61Car = matchCar(carsRes.data.items ?? [], carName, input.iracingCarId);
    }
  }

  const lapsRes = await g61FindLaps(
    {
      tracks: [g61Track.id],
      cars: g61Car ? [g61Car.id] : undefined,
      teams: teams.length ? teams : undefined,
      drivers: ["me"],
      group: "none",
      limit: 1000,
      // Undefined = no age limit; otherwise Garage 61's own season/day codes.
      age: input.age ?? undefined,
    },
    tk
  );
  if (!lapsRes.ok) {
    return { ok: false, error: `Garage 61 /laps failed (${lapsRes.status}): ${lapsRes.error}` };
  }
  const laps = lapsRes.data.items ?? [];
  const sampleLapKeys = laps.length
    ? Object.keys(laps[0] as unknown as Record<string, unknown>)
    : [];

  // A positive `age` is a day window; season codes are handled by the API only.
  const cutoffMs =
    typeof input.age === "number" && input.age > 0
      ? Date.now() - input.age * 86_400_000
      : null;

  const rows: G61LapRow[] = [];
  for (const lap of laps) {
    const o = lap as unknown as Record<string, unknown>;
    const driver = lapDriverName(lap);
    const laptimeSec = pickNum(o, ["lapTime", "lap_time", "time", "laptime"]);
    if (!driver || laptimeSec == null || laptimeSec <= 0) continue;
    const fuelUsed = pickNum(o, ["fuelUsed", "fuel_used", "fuel", "fuelUse"]) ?? 0;
    const trackTempC = pickNum(o, [
      "trackTemp",
      "track_temp",
      "trackTemperature",
      "track_temperature",
      "trackTempC",
    ]);
    const trackWetness = pickNum(o, [
      "trackWetness",
      "track_wetness",
      "wetness",
      "trackWetnessPct",
    ]);
    rows.push({
      driver,
      laptimeSec,
      fuelUsed,
      pitIn: pickBool(o, ["pitIn", "pit_in", "pitin"]),
      pitOut: pickBool(o, ["pitOut", "pit_out", "pitout"]),
      trackTempC,
      trackWetness,
      dateMs: pickDateMs(o),
    });
  }

  // Second pass on our side: the API's age codes are coarse (whole seasons), so
  // a day window is enforced here on the laps' own timestamps. Laps without a
  // date are kept — dropping them would silently empty an import.
  const dated = rows.filter((r) => r.dateMs != null);
  const datesMissing = dated.length === 0 && rows.length > 0;
  let lapsTooOld = 0;
  if (cutoffMs != null && dated.length > 0) {
    const before = rows.length;
    for (let i = rows.length - 1; i >= 0; i--) {
      const d = rows[i].dateMs;
      if (d != null && d < cutoffMs) rows.splice(i, 1);
    }
    lapsTooOld = before - rows.length;
  }
  const usedDates = rows
    .map((r) => r.dateMs)
    .filter((d): d is number => typeof d === "number");

  if (rows.length === 0) {
    return {
      ok: false,
      error: `Garage 61 returned no usable laps for ${g61Track.name}${g61Car ? " / " + g61Car.name : ""} (fetched ${laps.length}).`,
    };
  }

  const result = aggregateGarage61Laps(rows, {
    rosterNames: input.rosterNames,
  });
  if (result.drivers.length === 0) {
    const roster = (input.rosterNames ?? []).filter((n) => n.trim() !== "");
    if (roster.length > 0) {
      return {
        ok: false,
        error: `Fetched ${laps.length} laps, but none matched your roster drivers (${roster.join(", ")}). Check the names match their Garage 61 profiles, or clear the roster to include everyone.`,
      };
    }
    return {
      ok: false,
      error:
        "Couldn't derive clean full laps from the pulled data — the laps may lack per-lap fuel. Raw fields: " +
        (sampleLapKeys.join(", ") || "none"),
    };
  }

  return {
    ok: true,
    result,
    meta: {
      trackMatched: g61Track.name,
      carMatched: g61Car?.name ?? null,
      teams,
      lapsFetched: laps.length,
      lapsTooOld,
      window: windowLabel(input.age ?? null),
      oldestLapMs: usedDates.length ? Math.min(...usedDates) : null,
      newestLapMs: usedDates.length ? Math.max(...usedDates) : null,
      datesMissing,
      sampleLapKeys,
    },
  };
}
