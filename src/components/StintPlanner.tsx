"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  buildSchedule,
  fmtDuration,
  fmtLap,
  optimizeFuelSave,
  parseDurationToSec,
  type FuelSaveOptimization,
  type StintProfileKey,
} from "@/lib/stint-planner";
import {
  createStintPlan,
  updateStintPlan,
  liveUpdateStintPlan,
  getStintPlanLive,
} from "@/lib/actions/stint-plans";
import { uploadStintPlanEventResult } from "@/lib/actions/stint-plan-eventresult";
import {
  uploadStintPlanRaceLog,
  reparseStintPlanRaceLog,
} from "@/lib/actions/stint-plan-racelog";
import { postStintPlanToDiscord } from "@/lib/actions/stint-plan-discord";
import { CURRENT_VERSION } from "@/lib/changelog";
import {
  hydratePlanState,
  stateToInput,
  DEFAULT_TEMP_SLOPE_PER_C,
  DEFAULT_WET_DELTA_SEC,
  type PlannerAssignmentState,
  type PlannerState,
  type RaceLogDriverRow,
} from "@/lib/stint-plan-state";
import type { ClsDriverOption } from "@/lib/cls-drivers";
import type { ClsCarOption } from "@/lib/cls-tracks-cars";
import {
  aggregateGarage61Laps,
  type G61ImportResult,
  type G61LapRow,
} from "@/lib/garage61-import";
import { pullGarage61Laps } from "@/lib/actions/garage61-pull";
import StintDriverStats from "@/components/StintDriverStats";
import RaceLogDashboard from "@/components/RaceLogDashboard";
import {
  connectGarage61,
  setGarage61Team,
  disconnectGarage61,
  getGarage61Status,
  type G61TeamOption,
  type G61Status,
} from "@/lib/actions/garage61-connect";

/** True for the error Next.js throws when a Server Action id no longer exists
 *  on the server — i.e. the app was redeployed while this tab stayed open. */
const isStaleActionError = (e: unknown): boolean => {
  const msg =
    e instanceof Error ? `${e.message} ${e.name}` : String(e ?? "");
  return (
    /Failed to find Server Action/i.test(msg) ||
    /older or newer deployment/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /Connection closed/i.test(msg) ||
    /NetworkError/i.test(msg)
  );
};

/** Seconds → "1:23.456" for measured lap times from the race log. */
const fmtSec = (sec: number | null | undefined): string => {
  if (sec == null || !isFinite(sec)) return "—";
  const m = Math.floor(sec / 60);
  const rest = sec - m * 60;
  return `${m}:${rest.toFixed(3).padStart(6, "0")}`;
};

/** The three lives of a stint plan. */
type PlanPhase = "pre" | "during" | "post";
const PHASES: { key: PlanPhase; label: string; hint: string }[] = [
  { key: "pre", label: "Pre-Race", hint: "setup & drivers" },
  { key: "during", label: "During Race", hint: "schedule & live" },
  { key: "post", label: "After Race", hint: "result & analysis" },
];

const fmtClock = (ms: number | null): string =>
  ms == null
    ? "—"
    : new Date(ms).toLocaleString(undefined, {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

const fmtLaps = (n: number): string =>
  Number.isInteger(n) ? String(n) : n.toFixed(1);
const fmtFuel = (n: number): string => n.toFixed(1);
const fmtCountdown = (ms: number): string => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(sec).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
};

// Shift a lap-time string ("m:ss.s") by a delta in seconds; blanks/unparseable
// strings are returned unchanged (a blank per-driver time means "use standard").
const shiftLapStr = (str: string, deltaSec: number): string => {
  if (str.trim() === "") return str;
  const sec = parseDurationToSec(str);
  if (sec == null) return str;
  return fmtLap(Math.max(0, sec + deltaSec));
};
const round1 = (n: number): number => Math.round(n * 10) / 10;

// Shared input styling.
const inp =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none";
const lbl = "block text-[11px] font-medium uppercase tracking-wider text-zinc-500";
const card = "rounded-lg border border-zinc-800 bg-zinc-900/40 p-4";

// localStorage never notifies us of its own changes; we re-read on re-render.
const emptyStoreSubscribe = () => () => {};

export default function StintPlanner({
  initial,
  planId = null,
  initialUpdatedAtMs = null,
  clsDrivers,
  tracks,
  cars,
}: {
  initial: PlannerState;
  planId?: string | null;
  initialUpdatedAtMs?: number | null;
  clsDrivers: ClsDriverOption[];
  tracks: string[];
  cars: ClsCarOption[];
}) {
  const [s, setS] = useState<PlannerState>(initial);
  const [curId, setCurId] = useState<string | null>(planId);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ---- Stale-deployment guard -------------------------------------------
  // Every Server Action carries a build-specific id. After a redeploy the ids
  // of THIS page are gone, so uploads and auto-save fail with "Failed to find
  // Server Action …" — during a 6h race the tab has usually been open for
  // hours and the failure is otherwise completely silent. Detect it and say so.
  const [staleBuild, setStaleBuild] = useState(false);
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch("/api/build-id", { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { version?: string };
        if (j?.version && j.version !== CURRENT_VERSION) setStaleBuild(true);
      } catch {
        // offline / transient — the error path below still covers it
      }
    };
    void check();
    const iv = setInterval(() => void check(), 60_000);
    return () => clearInterval(iv);
  }, []);

  // ---- Live race sync (open editing, auto-save + auto-refresh) ----
  const [syncStatus, setSyncStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >(planId ? "saved" : "idle");
  const sRef = useRef(s);
  useEffect(() => {
    sRef.current = s;
  }, [s]);
  const lastSavedSnapshotRef = useRef(JSON.stringify(initial));
  const baseUpdatedAtRef = useRef<number>(initialUpdatedAtMs ?? 0);

  // Auto-save: debounce after a real edit (skips the initial load and any
  // change that was just applied from a remote refresh).
  useEffect(() => {
    if (!curId) return;
    const snap = JSON.stringify(s);
    if (snap === lastSavedSnapshotRef.current) return;
    const t = setTimeout(() => {
      void (async () => {
        setSyncStatus("saving");
        try {
          const res = await liveUpdateStintPlan(curId, s.title, s);
          if (res.ok) {
            lastSavedSnapshotRef.current = snap;
            baseUpdatedAtRef.current = res.updatedAt;
            setSyncStatus("saved");
          } else {
            setSyncStatus("error");
          }
        } catch (e) {
          // A dead Server Action id (redeploy while this tab was open) throws
          // here instead of returning — surface it rather than losing edits.
          if (isStaleActionError(e)) setStaleBuild(true);
          setSyncStatus("error");
        }
      })();
    }, 1200);
    return () => clearTimeout(t);
  }, [s, curId]);

  // Auto-refresh: poll for a newer server version and apply it — but only when
  // this client has no unsaved local edits (otherwise its own save wins).
  useEffect(() => {
    if (!curId) return;
    const iv = setInterval(() => {
      void (async () => {
        if (JSON.stringify(sRef.current) !== lastSavedSnapshotRef.current) return;
        const res = await getStintPlanLive(curId);
        if (res.ok && res.updatedAt > baseUpdatedAtRef.current) {
          const next = hydratePlanState(res.payload, res.title);
          lastSavedSnapshotRef.current = JSON.stringify(next);
          baseUpdatedAtRef.current = res.updatedAt;
          setS(next);
          setSyncStatus("saved");
        }
      })();
    }, 8000);
    return () => clearInterval(iv);
  }, [curId]);

  // The edit token (only the plan's creator holds it) is read live from local
  // storage via useSyncExternalStore — SSR-safe (no hydration mismatch) and it
  // re-reads after we save a plan and update curId.
  const editToken = useSyncExternalStore(
    emptyStoreSubscribe,
    () => (curId ? window.localStorage.getItem(`stintplan:${curId}`) : null),
    () => null
  );

  const result = useMemo(() => buildSchedule(stateToInput(s)), [s]);
  const [rainFromStr, setRainFromStr] = useState("");

  // Ticking wall clock for the live "now" tracker. Starts at 0 (SSR-safe: no
  // hydration mismatch) and updates every second once mounted. The initial
  // tick is scheduled async so we never call setState synchronously in effect.
  const [now, setNow] = useState(0);
  useEffect(() => {
    const tick = () => setNow(Date.now());
    const t0 = setTimeout(tick, 0);
    const id = setInterval(tick, 1000);
    return () => {
      clearTimeout(t0);
      clearInterval(id);
    };
  }, []);

  // ---- state helpers ----
  const patchEvent = (k: keyof PlannerState["event"], v: string) =>
    setS((p) => ({ ...p, event: { ...p.event, [k]: v } }));
  const patchStd = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, standard: { ...p.standard, [k]: v } }));
  const patchSav = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, saving: { ...p.saving, [k]: v } }));

  const addClsDriver = (userId: string) =>
    setS((p) => {
      if (!userId || p.drivers.some((d) => d.id === userId)) return p;
      const drv = clsDrivers.find((d) => d.id === userId);
      if (!drv) return p;
      return {
        ...p,
        drivers: [...p.drivers, { id: drv.id, name: drv.name, laptime: "" }],
      };
    });
  const patchDriverLaptime = (id: string, v: string) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => (d.id === id ? { ...d, laptime: v } : d)),
    }));
  const removeDriver = (id: string) =>
    setS((p) => {
      const availability = { ...p.availability };
      delete availability[id];
      return {
        ...p,
        drivers: p.drivers.filter((d) => d.id !== id),
        assignments: p.assignments.map((a) => ({
          ...a,
          driverId: a.driverId === id ? null : a.driverId,
          spotterId: a.spotterId === id ? null : a.spotterId,
        })),
        availability,
      };
    });

  // ---- availability + spotter helpers ----
  const raceSecForAvail = parseDurationToSec(s.event.raceDuration) ?? 0;
  const hourCount = Math.max(0, Math.ceil(raceSecForAvail / 3600));
  const isBlocked = (driverId: string, hour: number) =>
    (s.availability[driverId] ?? []).includes(hour);
  const toggleAvail = (driverId: string, hour: number) =>
    setS((p) => {
      const cur = new Set(p.availability[driverId] ?? []);
      if (cur.has(hour)) cur.delete(hour);
      else cur.add(hour);
      const next = { ...p.availability };
      const arr = [...cur].sort((a, b) => a - b);
      if (arr.length === 0) delete next[driverId];
      else next[driverId] = arr;
      return { ...p, availability: next };
    });
  const coveredHours = (startSec: number, endSec: number): number[] => {
    const h0 = Math.floor(startSec / 3600);
    const h1 = Math.floor(Math.max(startSec, endSec - 1) / 3600);
    const out: number[] = [];
    for (let h = h0; h <= h1; h++) out.push(h);
    return out;
  };
  const driverFreeForStint = (
    driverId: string,
    startSec: number,
    endSec: number
  ) => coveredHours(startSec, endSec).every((h) => !isBlocked(driverId, h));

  const assignmentAt = (i: number): PlannerAssignmentState =>
    s.assignments[i] ?? { profile: "standard", driverId: null };
  const setAssignment = (i: number, patch: Partial<PlannerAssignmentState>) =>
    setS((p) => {
      const next = [...p.assignments];
      while (next.length <= i)
        next.push({ profile: "standard", driverId: null });
      next[i] = { ...next[i], ...patch };
      return { ...p, assignments: next };
    });

  // Fill drivers across the stints. `double` = double-stint pairs (each driver
  // does 2 consecutive stints, so every other stop is refuel-only); otherwise
  // single-stint round-robin. Preserves each stint's other fields (wet, note…).
  const fillDrivers = (p: PlannerState, double: boolean): PlannerState => {
    if (p.drivers.length === 0) return p;
    const n = Math.max(result.stints.length, p.assignments.length);
    const next: PlannerAssignmentState[] = [];
    for (let i = 0; i < n; i++) {
      const di = double ? Math.floor(i / 2) : i;
      next.push({
        ...(p.assignments[i] ?? { profile: "standard", driverId: null }),
        profile: p.assignments[i]?.profile ?? "standard",
        driverId: p.drivers[di % p.drivers.length].id,
        correctionMin: p.assignments[i]?.correctionMin ?? 0,
      });
    }
    return { ...p, assignments: next };
  };
  const autoFill = () => setS((p) => fillDrivers(p, p.event.doubleStint));
  const setDoubleStint = (on: boolean) =>
    setS((p) => fillDrivers({ ...p, event: { ...p.event, doubleStint: on } }, on));
  const clearAssignments = () => setS((p) => ({ ...p, assignments: [] }));

  const patchNote = (k: "pre" | "during" | "post", v: string) =>
    setS((p) => ({ ...p, notes: { ...p.notes, [k]: v } }));

  const [uploadingResult, setUploadingResult] = useState(false);
  const [resultError, setResultError] = useState<string | null>(null);
  /** Driver names on this plan — lets the server flag our own entry/car. */
  const rosterNames = () =>
    JSON.stringify(s.drivers.map((d) => d.name).filter((n) => n.trim() !== ""));

  async function onEventResultFile(file: File | null) {
    if (!file) return;
    setUploadingResult(true);
    setStatus(null);
    setResultError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roster", rosterNames());
      const res = await uploadStintPlanEventResult(fd);
      if (!res.ok) {
        setResultError(res.error);
        setStatus(res.error);
        return;
      }
      setS((p) => ({
        ...p,
        eventResult: {
          url: res.url,
          name: res.name,
          summary: res.summary,
          parsedAt: new Date().toISOString(),
          ownDrivers: res.ownDrivers,
          ownCarNumber: res.ownCarNumber,
        },
      }));
      setStatus(
        `Eventresult parsed — ${res.summary.length} ${
          res.teamEvent ? "teams" : "drivers"
        }. Saved with the plan.`
      );
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setResultError(
          "The site was updated while this tab was open — reload the page, then upload again."
        );
      } else {
        setResultError("Upload failed — please try again.");
      }
    } finally {
      setUploadingResult(false);
    }
  }
  const removeEventResult = () => {
    setResultError(null);
    setS((p) => ({ ...p, eventResult: null }));
  };

  // ---- Race-logger JSONL (measured pace + real stints) --------------------
  const [uploadingLog, setUploadingLog] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  async function onRaceLogFile(file: File | null) {
    if (!file) return;
    setUploadingLog(true);
    setStatus(null);
    setLogError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("roster", rosterNames());
      const res = await uploadStintPlanRaceLog(fd);
      if (!res.ok) {
        setLogError(res.error);
        return;
      }
      setS((p) => ({
        ...p,
        raceLog: { ...res.log, parsedAt: new Date().toISOString() },
      }));
      setStatus(
        res.ownCarNumber
          ? `Race log parsed — stints of car #${res.ownCarNumber}. Saved with the plan.`
          : "Race log parsed. (No car matched this plan's drivers, so no stint breakdown.)"
      );
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setLogError(
          "The site was updated while this tab was open — reload the page, then upload again."
        );
      } else {
        setLogError("Upload failed — please try again.");
      }
    } finally {
      setUploadingLog(false);
    }
  }
  const removeRaceLog = () => {
    setLogError(null);
    setS((p) => ({ ...p, raceLog: null }));
  };

  /** Re-analyse the archived log with the current parser (older uploads are
   *  missing the lap timestamps needed to follow the plan's driver order). */
  async function reanalyseRaceLog() {
    const cur = s.raceLog;
    if (!cur) return;
    setUploadingLog(true);
    setLogError(null);
    try {
      const res = await reparseStintPlanRaceLog(cur.url, cur.name, rosterNames());
      if (!res.ok) {
        setLogError(res.error);
        return;
      }
      setS((p) => ({
        ...p,
        raceLog: { ...res.log, parsedAt: new Date().toISOString() },
      }));
      setStatus("Race log re-analysed with the current parser.");
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setLogError(
          "The site was updated while this tab was open — reload the page, then try again."
        );
      } else {
        setLogError("Re-analysing failed — please try again.");
      }
    } finally {
      setUploadingLog(false);
    }
  }

  /** An older parse that predates lap timestamps: the plan's driver order
   *  cannot be applied to it until the archived file is read again. */
  const raceLogNeedsReparse =
    s.raceLog != null &&
    s.raceLog.stints.length > 0 &&
    !s.raceLog.stints.some((st) => st.startSec != null);

  /** Team event = rows carry a driver line-up (endurance). */
  const resultIsTeamEvent = useMemo(
    () => (s.eventResult?.summary ?? []).some((r) => (r.drivers?.length ?? 0) > 0),
    [s.eventResult]
  );
  /** A 57-entry endurance result buries everything below it, so the table
   *  opens on our own class (or the top 10) with a toggle for the full field. */
  const [showAllResults, setShowAllResults] = useState(false);
  const visibleResultRows = useMemo(() => {
    const all = s.eventResult?.summary ?? [];
    if (showAllResults || all.length <= 12) return all;
    const ownClass = all.find((r) => r.own)?.carClass ?? null;
    const shortlist = ownClass
      ? all.filter((r) => r.carClass === ownClass || r.own)
      : all.slice(0, 10);
    // If the shortlist is still the whole field, there's nothing to collapse.
    return shortlist.length && shortlist.length < all.length ? shortlist : all.slice(0, 10);
  }, [s.eventResult, showAllResults]);

  /** Multiclass = more than one car class in the result. */
  const resultHasClasses = useMemo(() => {
    const set = new Set(
      (s.eventResult?.summary ?? [])
        .map((r) => r.carClass)
        .filter((c): c is string => !!c)
    );
    return set.size > 1;
  }, [s.eventResult]);

  /** Measured green pace per plan driver, keyed by normalised name. */
  const logPaceByDriver = useMemo(() => {
    const m = new Map<string, RaceLogDriverRow>();
    for (const r of s.raceLog?.drivers ?? []) {
      const k = r.driver.trim().toLowerCase();
      const prev = m.get(k);
      if (!prev || (r.laps ?? 0) > (prev.laps ?? 0)) m.set(k, r);
    }
    return m;
  }, [s.raceLog]);

  /** Write each driver's measured clean pace into their plan lap time. */
  const applyLogPaceToDrivers = () => {
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => {
        const row = logPaceByDriver.get(d.name.trim().toLowerCase());
        const sec = row?.greenSec ?? row?.medianSec ?? null;
        return sec ? { ...d, laptime: fmtLap(sec) } : d;
      }),
    }));
    setStatus("Driver lap times set from the race log.");
  };

  const applyLogTrackTemp = () => {
    const t = s.raceLog?.trackTempC;
    if (t == null) return;
    setS((p) => ({ ...p, event: { ...p.event, trackTempC: String(t) } }));
    setStatus(`Track temperature set to ${t} °C from the race log.`);
  };

  const [fuelSaveOpt, setFuelSaveOpt] = useState<FuelSaveOptimization | null>(
    null
  );
  const [fuelSaveMsg, setFuelSaveMsg] = useState<string | null>(null);
  const runFuelSaveOptimizer = () => {
    const inp = stateToInput(s);
    // Stint-weighted average of the real per-driver lap times (drivers without
    // a custom time fall back to the Standard profile pace). This anchors the
    // optimizer to who is actually driving instead of the Standard value alone.
    const stdLap = inp.standard.laptimeSec;
    let wSum = 0;
    let lSum = 0;
    for (const d of inp.drivers) {
      const stints =
        result.perDriver.find((p) => p.driverId === d.id)?.stints ?? 0;
      const w = stints > 0 ? stints : 1;
      const lap = d.laptimeSec && d.laptimeSec > 0 ? d.laptimeSec : stdLap;
      wSum += w;
      lSum += w * lap;
    }
    const avgLap = wSum > 0 ? lSum / wSum : stdLap;
    const paceScale = stdLap > 0 ? avgLap / stdLap : 1;

    const opt = optimizeFuelSave({
      raceDurationSec: inp.raceDurationSec,
      tankSize: inp.tankSize,
      fuelReserve: inp.fuelReserve,
      pitLossSec: inp.pitLossSec,
      standard: inp.standard,
      saving: {
        laptimeSec: parseDurationToSec(s.saving.laptime) ?? 0,
        fuelPerLap: Number(s.saving.fuelPerLap) || 0,
      },
      paceScale,
    });
    setFuelSaveOpt(opt);
    // Auto-apply the best (max-distance) strategy into the Standard profile so
    // the stint schedule below immediately runs at the fuel-save-optimal pace.
    if (opt.ok) {
      const best = opt.strategies[opt.bestIndex];
      setS((p) => ({
        ...p,
        standard: {
          laptime: fmtLap(best.laptimeSec),
          fuelPerLap: best.fuelPerLap.toFixed(2),
        },
      }));
      const paceNote =
        Math.abs(paceScale - 1) > 0.002
          ? ` (weighted for real driver pace, ${fmtLap(avgLap)} avg)`
          : "";
      setFuelSaveMsg(
        `Applied to Standard profile: ${best.stops} stops · target ${fmtLap(best.laptimeSec)} @ ${best.fuelPerLap.toFixed(2)} L/lap → ${best.totalLaps.toFixed(1)} laps${paceNote}.`
      );
    } else {
      setFuelSaveMsg(null);
    }
  };

  // ---- Garage 61 session import (client-side .xlsx parse) ----
  const [g61, setG61] = useState<G61ImportResult | null>(null);
  const [g61Busy, setG61Busy] = useState(false);
  const [g61PullBusy, setG61PullBusy] = useState(false);
  const [g61Msg, setG61Msg] = useState<string | null>(null);
  async function onGarage61Files(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    setG61Busy(true);
    setG61Msg(null);
    try {
      const XLSX = await import("xlsx");
      const rows: G61LapRow[] = [];
      for (const file of Array.from(fileList)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array" });
        const sheetName = wb.SheetNames.find((n) =>
          n.toLowerCase().startsWith("session")
        );
        if (!sheetName) continue;
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
          header: 1,
          raw: true,
        });
        if (grid.length < 2) continue;
        const header = (grid[0] as unknown[]).map((h) => String(h ?? "").trim());
        const col = (name: string) => header.indexOf(name);
        const cLap = col("Lap time");
        const cDrv = col("Driver");
        const cFuel = col("Fuel used");
        const cPin = col("Pit in");
        const cPout = col("Pit out");
        const cTemp = col("Track temp");
        const cWet = col("Track Wetness");
        if (cLap < 0 || cDrv < 0 || cFuel < 0) continue;
        for (let i = 1; i < grid.length; i++) {
          const r = grid[i] as unknown[];
          const drv = String(r[cDrv] ?? "").trim();
          const rawLap = Number(r[cLap]);
          const fuel = Number(r[cFuel]);
          if (!drv || !isFinite(rawLap) || !isFinite(fuel)) continue;
          const rawTemp = cTemp >= 0 ? Number(r[cTemp]) : NaN;
          const rawWet = cWet >= 0 ? Number(r[cWet]) : NaN;
          rows.push({
            driver: drv,
            laptimeSec: rawLap * 86400, // Excel duration = fraction of a day
            fuelUsed: fuel,
            pitIn: Number(cPin >= 0 ? r[cPin] : 0) === 1,
            pitOut: Number(cPout >= 0 ? r[cPout] : 0) === 1,
            trackTempC: isFinite(rawTemp) ? rawTemp : null,
            trackWetness: isFinite(rawWet) ? rawWet : null,
          });
        }
      }
      if (rows.length === 0) {
        setG61Msg(
          "No lap data found — is this a Garage 61 session export (.xlsx)?"
        );
        return;
      }
      const result = aggregateGarage61Laps(rows, {
        rosterNames: s.drivers.map((d) => d.name),
      });
      if (result.drivers.length === 0) {
        setG61Msg(
          s.drivers.length > 0
            ? "No clean laps matched your roster drivers — check their names match their Garage 61 profiles, or add them to the plan."
            : "Couldn't derive clean laps from the file(s)."
        );
        return;
      }
      setG61(result);
    } catch {
      setG61Msg("Could not read the file — is it a valid .xlsx export?");
    } finally {
      setG61Busy(false);
    }
  }
  function applyGarage61() {
    if (!g61) return;
    const norm = (x: string) => x.trim().toLowerCase();
    const matched = g61.drivers.filter((gd) =>
      s.drivers.some((d) => norm(d.name) === norm(gd.driver))
    ).length;

    // Temperature model: prefer a data-driven slope, else keep the manual one.
    const srcTemp = g61.temp.sourceTempC;
    const dataSlope = g61.temp.slopePerC;
    const manual = s.tempModel?.manualSlopePerC ?? DEFAULT_TEMP_SLOPE_PER_C;
    const slope = dataSlope != null ? dataSlope : manual;
    const fromData = dataSlope != null;
    // Project the (source-temp) pace to the race temp if one is set, else leave
    // it at the data's source temp.
    const raceTempNum = Number(s.event.trackTempC);
    const raceTemp =
      s.event.trackTempC.trim() !== "" && isFinite(raceTempNum)
        ? raceTempNum
        : null;
    const targetTemp = raceTemp ?? srcTemp;
    const proj =
      srcTemp != null && targetTemp != null ? slope * (targetTemp - srcTemp) : 0;

    // Wet-weather model from the rain laps (measured delta wins; else manual).
    const measuredWet =
      g61.wet && g61.wet.deltaSec != null && g61.wet.deltaSec > 0
        ? g61.wet.deltaSec
        : null;
    const manualWet = s.wetModel?.manualDeltaSec ?? DEFAULT_WET_DELTA_SEC;
    const wetDelta = measuredWet ?? manualWet;

    setS((p) => ({
      ...p,
      event: {
        ...p.event,
        trackTempC:
          targetTemp != null ? String(round1(targetTemp)) : p.event.trackTempC,
        conditions: "dry",
      },
      standard: {
        laptime: fmtLap(g61.overall.laptimeSec + proj),
        fuelPerLap: g61.overall.fuelPerLap.toFixed(2),
      },
      drivers: p.drivers.map((d) => {
        const gd = g61.drivers.find((x) => norm(x.driver) === norm(d.name));
        return gd ? { ...d, laptime: fmtLap(gd.racePaceSec + proj) } : d;
      }),
      tempModel: {
        appliedTempC: targetTemp,
        slopePerC: slope,
        fromData,
        manualSlopePerC: manual,
      },
      wetModel: {
        deltaSec: wetDelta,
        fromData: measuredWet != null,
        manualDeltaSec: manualWet,
        wetFuelPerLap: g61.wet?.fuelPerLap ?? null,
        appliedDeltaSec: 0,
      },
      g61Analysis: { ...g61, generatedAt: new Date().toISOString() },
    }));

    const tempNote =
      srcTemp != null
        ? fromData
          ? ` Temperature fit from data: ${slope.toFixed(3)} s/°C over ${g61.temp.minTempC?.toFixed(0)}–${g61.temp.maxTempC?.toFixed(0)}°C; pace set at ${targetTemp != null ? round1(targetTemp) : round1(srcTemp)}°C.`
          : ` Laps were all near ${round1(srcTemp)}°C (no spread to fit) — using the ${(slope * 10).toFixed(1)} s/10°C manual estimate.`
        : "";
    setG61Msg(
      `Applied: Standard profile + lap times for ${matched} matched driver${matched === 1 ? "" : "s"}.${tempNote} Save keeps it.`
    );
  }

  // Apply a new race track temperature: shift Standard + Fuel-save + per-driver
  // lap times by slope × Δtemp (called on blur of the Track temp field).
  function applyTempFromInput(valStr: string) {
    const newTemp = Number(valStr);
    if (valStr.trim() === "" || !isFinite(newTemp)) return;
    setS((p) => {
      const tm = p.tempModel;
      if (!tm) {
        // First entry establishes the baseline — no shift yet.
        return {
          ...p,
          tempModel: {
            appliedTempC: newTemp,
            slopePerC: DEFAULT_TEMP_SLOPE_PER_C,
            fromData: false,
            manualSlopePerC: DEFAULT_TEMP_SLOPE_PER_C,
          },
        };
      }
      if (tm.appliedTempC == null) {
        return { ...p, tempModel: { ...tm, appliedTempC: newTemp } };
      }
      const delta = tm.slopePerC * (newTemp - tm.appliedTempC);
      if (Math.abs(delta) < 1e-6) {
        return { ...p, tempModel: { ...tm, appliedTempC: newTemp } };
      }
      return {
        ...p,
        standard: { ...p.standard, laptime: shiftLapStr(p.standard.laptime, delta) },
        saving: { ...p.saving, laptime: shiftLapStr(p.saving.laptime, delta) },
        drivers: p.drivers.map((d) =>
          d.laptime.trim() ? { ...d, laptime: shiftLapStr(d.laptime, delta) } : d
        ),
        tempModel: { ...tm, appliedTempC: newTemp },
      };
    });
  }

  // Edit the manual sensitivity (entered as seconds per 10 °C).
  function setManualSlopePer10(valStr: string) {
    const per10 = Number(valStr);
    setS((p) => {
      const base = p.tempModel ?? {
        appliedTempC:
          p.event.trackTempC.trim() !== "" && isFinite(Number(p.event.trackTempC))
            ? Number(p.event.trackTempC)
            : null,
        slopePerC: DEFAULT_TEMP_SLOPE_PER_C,
        fromData: false,
        manualSlopePerC: DEFAULT_TEMP_SLOPE_PER_C,
      };
      const per = isFinite(per10) ? per10 / 10 : base.manualSlopePerC;
      return {
        ...p,
        tempModel: {
          ...base,
          manualSlopePerC: per,
          slopePerC: base.fromData ? base.slopePerC : per,
        },
      };
    });
  }

  const emptyWet = (): NonNullable<PlannerState["wetModel"]> => ({
    deltaSec: DEFAULT_WET_DELTA_SEC,
    fromData: false,
    manualDeltaSec: DEFAULT_WET_DELTA_SEC,
    wetFuelPerLap: null,
    appliedDeltaSec: 0,
  });

  // Edit the wet penalty (seconds/lap). The engine adds it to whichever stints
  // are flagged wet, so nothing is shifted here — the schedule just recomputes.
  function setWetDelta(valStr: string) {
    const v = Number(valStr);
    setS((p) => {
      const wm = p.wetModel ?? emptyWet();
      const nd = isFinite(v) ? Math.max(0, v) : wm.deltaSec;
      return {
        ...p,
        wetModel: { ...wm, deltaSec: nd, manualDeltaSec: nd, fromData: false },
      };
    });
  }

  // Mark stint `fromIndex` (0-based) and every following stint as wet; earlier
  // stints dry. Serves the common "dry, then rain arrives" case.
  function setRainFromStint(fromIndex: number) {
    setS((p) => {
      const n = Math.max(result.stints.length, p.assignments.length);
      const next = [...p.assignments];
      while (next.length < n) next.push({ profile: "standard", driverId: null });
      for (let i = 0; i < next.length; i++)
        next[i] = { ...next[i], wet: i >= fromIndex };
      return { ...p, assignments: next };
    });
  }
  const clearWetStints = () =>
    setS((p) => ({
      ...p,
      assignments: p.assignments.map((a) => ({ ...a, wet: false })),
    }));

  // ---- Per-stint track temperature ---------------------------------------
  // A six-hour race that starts at 43 °C and finishes at 28 °C is not one
  // temperature. Enter the two ends and every stint gets its share; single
  // stints can then be corrected by hand (a cloud burst, a caution period).
  const [tempRampFrom, setTempRampFrom] = useState("");
  const [tempRampPeak, setTempRampPeak] = useState("");
  const [tempRampTo, setTempRampTo] = useState("");
  const [tempRampPeakAt, setTempRampPeakAt] = useState("");
  const applyTempRamp = () => {
    const a = Number(tempRampFrom);
    const b = Number(tempRampTo);
    if (!isFinite(a) || !isFinite(b) || tempRampFrom === "" || tempRampTo === "") {
      setStatus("Enter at least a start and an end temperature for the ramp.");
      return;
    }
    const n = result.stints.length;
    if (n === 0) return;
    // The peak is optional: without it the ramp is one straight line from
    // start to end. With it, two straight lines meeting at the peak stint —
    // a day race warms up until early afternoon and cools off after.
    const hasPeak = tempRampPeak !== "" && isFinite(Number(tempRampPeak));
    const peak = Number(tempRampPeak);
    const peakAtRaw = Number(tempRampPeakAt);
    // 1-based in the UI, and clamped so the peak always has a slope on both
    // sides. Default: the middle stint.
    const peakIdx = hasPeak
      ? Math.min(
          n - 1,
          Math.max(
            0,
            tempRampPeakAt !== "" && isFinite(peakAtRaw)
              ? Math.round(peakAtRaw) - 1
              : Math.round((n - 1) / 2)
          )
        )
      : -1;

    const tempAt = (i: number): number => {
      if (!hasPeak) return n === 1 ? a : a + (b - a) * (i / (n - 1));
      if (i === peakIdx) return peak;
      if (i < peakIdx) return a + (peak - a) * (i / peakIdx);
      return peak + (b - peak) * ((i - peakIdx) / (n - 1 - peakIdx));
    };

    setS((p) => {
      const next = [...p.assignments];
      for (let i = 0; i < n; i++) {
        const t = Math.round(tempAt(i) * 10) / 10;
        next[i] = { ...(next[i] ?? { profile: "standard", driverId: null }), trackTempC: t };
      }
      return { ...p, assignments: next };
    });
    setStatus(
      hasPeak
        ? `Track temperature ramped ${a} → ${peak} °C at stint ${peakIdx + 1} → ${b} °C across ${n} stints.`
        : `Track temperature ramped ${a} °C → ${b} °C across ${n} stints.`
    );
  };
  const clearStintTemps = () =>
    setS((p) => ({
      ...p,
      assignments: p.assignments.map((a) => ({ ...a, trackTempC: null })),
    }));
  // ---- Garage 61 live pull (server-side API, uses the event Track + Car) ----
  async function onGarage61Pull() {
    if (!s.event.track.trim()) {
      setG61Msg("Select a Track above first — the live pull uses the event Track and Car.");
      return;
    }
    setG61PullBusy(true);
    setG61Msg(null);
    try {
      const car = cars.find((c) => c.name === s.event.car);
      const res = await pullGarage61Laps({
        planId: curId,
        track: s.event.track,
        carName: s.event.car,
        iracingCarId: car?.iracingCarId ?? null,
        rosterNames: s.drivers.map((d) => d.name),
      });
      if (!res.ok) {
        setG61Msg(res.error);
        return;
      }
      setG61(res.result);
      setG61Msg(
        `Pulled ${res.meta.lapsFetched} lap${res.meta.lapsFetched === 1 ? "" : "s"} from Garage 61 (${res.meta.trackMatched ?? "track"}${res.meta.carMatched ? " · " + res.meta.carMatched : ""}). Review below, then Apply to plan.`
      );
    } catch {
      setG61Msg("Live pull failed — please try again.");
    } finally {
      setG61PullBusy(false);
    }
  }

  // ---- Garage 61 connection (per-plan token, creator only) ----
  const [g61Status, setG61Status] = useState<G61Status | null>(null);
  const [g61Token, setG61Token] = useState("");
  const [g61Teams, setG61Teams] = useState<G61TeamOption[]>([]);
  const [g61ConnBusy, setG61ConnBusy] = useState(false);
  const [g61ConnMsg, setG61ConnMsg] = useState<string | null>(null);
  const [g61ShowConnect, setG61ShowConnect] = useState(false);

  // Load connection status whenever the plan id changes.
  useEffect(() => {
    if (!curId) {
      setG61Status(null);
      return;
    }
    let alive = true;
    void (async () => {
      const st = await getGarage61Status(curId);
      if (alive) setG61Status(st);
    })();
    return () => {
      alive = false;
    };
  }, [curId]);

  async function onG61Connect() {
    if (!curId || !editToken) return;
    if (g61Token.trim().length < 8) {
      setG61ConnMsg("Paste your Garage 61 personal access token first.");
      return;
    }
    setG61ConnBusy(true);
    setG61ConnMsg(null);
    try {
      const res = await connectGarage61(curId, editToken, g61Token.trim());
      if (!res.ok) {
        setG61ConnMsg(res.error);
        return;
      }
      setG61Token("");
      setG61Teams(res.teams);
      const st = await getGarage61Status(curId);
      setG61Status(st);
      setG61ConnMsg(
        res.teams.length > 1
          ? "Connected. Pick which team to pull from below."
          : "Connected ✓"
      );
    } catch {
      setG61ConnMsg("Couldn't connect — please try again.");
    } finally {
      setG61ConnBusy(false);
    }
  }

  async function onG61PickTeam(slug: string) {
    if (!curId || !editToken) return;
    const team = g61Teams.find((t) => t.slug === slug);
    setG61ConnBusy(true);
    try {
      await setGarage61Team(curId, editToken, slug, team?.name ?? "");
      const st = await getGarage61Status(curId);
      setG61Status(st);
    } finally {
      setG61ConnBusy(false);
    }
  }

  async function onG61Disconnect() {
    if (!curId || !editToken) return;
    setG61ConnBusy(true);
    setG61ConnMsg(null);
    try {
      await disconnectGarage61(curId, editToken);
      setG61Teams([]);
      const st = await getGarage61Status(curId);
      setG61Status(st);
      setG61ConnMsg("Disconnected.");
    } finally {
      setG61ConnBusy(false);
    }
  }

  const [postingDiscord, setPostingDiscord] = useState(false);
  async function onPostDiscord() {
    if (!curId) return;
    setPostingDiscord(true);
    setStatus(null);
    try {
      const res = await postStintPlanToDiscord(curId);
      setStatus(res.ok ? "Posted to Discord ✓" : res.error);
    } finally {
      setPostingDiscord(false);
    }
  }

  const shareUrl =
    typeof window !== "undefined" && curId
      ? `${window.location.origin}/stint-planner/${curId}`
      : null;

  async function savePlan(forceNew = false) {
    setSaving(true);
    setStatus(null);
    try {
      const res =
        !forceNew && curId && editToken
          ? await updateStintPlan(curId, editToken, s.title, s)
          : await createStintPlan(s.title, s);
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      if (typeof window !== "undefined") {
        window.localStorage.setItem(`stintplan:${res.id}`, res.editToken);
        window.history.replaceState(null, "", `/stint-planner/${res.id}`);
      }
      // Prime the live-sync refs so auto-save/refresh start cleanly.
      lastSavedSnapshotRef.current = JSON.stringify(s);
      baseUpdatedAtRef.current = Date.now();
      setSyncStatus("saved");
      setCurId(res.id);
      const url = `${window.location.origin}/stint-planner/${res.id}`;
      try {
        await navigator.clipboard.writeText(url);
        setStatus("Saved — share link copied to clipboard.");
      } catch {
        setStatus("Saved. Share link is in the address bar.");
      }
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setStatus(
          "The site was updated while this tab was open — reload the page, then save again."
        );
      } else {
        setStatus("Saving failed — please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const std = result.template.standard;
  const sav = result.template.saving;
  const showClock = s.event.sessionStartLocal.trim() !== "";
  // Keep a saved track/car selectable even if it isn't in the current CLS list.
  const trackOptions =
    s.event.track && !tracks.includes(s.event.track)
      ? [s.event.track, ...tracks]
      : tracks;
  const carOptions =
    s.event.car && !cars.some((c) => c.name === s.event.car)
      ? [{ name: s.event.car, iracingCarId: null }, ...cars]
      : cars;
  const lastStint = result.stints[result.stints.length - 1] ?? null;

  // Live "now" tracker (only when a session start is set).
  const raceLive = showClock && now > 0 && result.raceStartUtcMs != null;
  const currentIdx = raceLive
    ? result.stints.findIndex(
        (st) =>
          st.wallStartMs != null &&
          st.wallEndMs != null &&
          now >= st.wallStartMs &&
          now < st.wallEndMs
      )
    : -1;
  const currentStint = currentIdx >= 0 ? result.stints[currentIdx] : null;

  // ---- Phase tabs --------------------------------------------------------
  // Which of the three lives the plan is in right now. Derived from the race
  // clock so opening the plan mid-race lands on the schedule, not on setup —
  // until the user picks a tab themselves, then their choice wins.
  const autoPhase: PlanPhase = useMemo(() => {
    const start = result.raceStartUtcMs;
    if (start == null || now === 0) return "pre";
    if (now < start) return "pre";
    // 20 min of grace after the chequered flag: the debrief starts once the
    // team has actually stopped, not the second the clock runs out.
    const end = (lastStint?.wallEndMs ?? start) + 20 * 60_000;
    return now <= end ? "during" : "post";
  }, [now, result.raceStartUtcMs, lastStint?.wallEndMs]);
  const [manualPhase, setManualPhase] = useState<PlanPhase | null>(null);
  const phase: PlanPhase = manualPhase ?? autoPhase;
  const setPhase = (p: PlanPhase) => setManualPhase(p);

  return (
    <div className="space-y-6">
      {/* The app was redeployed while this tab was open: every Server Action
          from this build is gone, so nothing this page sends will land. */}
      {staleBuild && (
        <div className="sticky top-2 z-40 flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-950/80 px-4 py-3 text-sm text-amber-100 shadow-lg backdrop-blur print:hidden">
          <span>
            <strong>A new version of the site is live.</strong> This tab is
            running the old one — uploads and auto-save will fail until you
            reload.
          </span>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400"
          >
            Reload now
          </button>
        </div>
      )}

      {/* Header: title + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[16rem] flex-1">
          <label className={lbl}>Plan title</label>
          <input
            className={`${inp} text-lg font-semibold`}
            value={s.title}
            onChange={(e) => setS((p) => ({ ...p, title: e.target.value }))}
            placeholder="e.g. 6h Road America"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {!curId && (
            <button
              onClick={() => savePlan(false)}
              disabled={saving}
              className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save & share"}
            </button>
          )}
          {curId && (
            <span
              className="flex items-center gap-1.5 rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300"
              title="This plan is live: your edits save automatically and everyone with the link sees them within a few seconds."
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              {syncStatus === "saving"
                ? "Saving…"
                : syncStatus === "error"
                  ? "Sync error — retrying"
                  : "Live · auto-saving"}
            </span>
          )}
          {shareUrl && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Copy link
            </button>
          )}
          {curId && (
            <button
              onClick={onPostDiscord}
              disabled={postingDiscord}
              className="rounded border border-indigo-700/60 bg-indigo-950/40 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-50"
            >
              {postingDiscord ? "Posting…" : "Post to Discord"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Print
          </button>
        </div>
      </div>
      {status && (
        <p className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {status}
        </p>
      )}

      {/* Phase tabs — the plan has three lives: building it, running it,
          and picking it apart afterwards. Only one is ever on screen; all
          three are in the DOM so a printout stays complete. */}
      <div className="sticky top-0 z-30 -mx-1 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 backdrop-blur print:hidden">
        {PHASES.map((ph) => (
          <button
            key={ph.key}
            onClick={() => setPhase(ph.key)}
            className={`flex-1 rounded px-3 py-2 text-sm font-semibold transition ${
              phase === ph.key
                ? "bg-[#ff6b35] text-zinc-950"
                : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {ph.label}
            <span className="ml-1.5 hidden text-xs font-normal opacity-70 sm:inline">
              {ph.hint}
            </span>
          </button>
        ))}
      </div>
      {/* ===== PRE ===== */}
      <div className={`space-y-6 ${phase === "pre" ? "" : "hidden print:block"}`}>
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Event config */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
            Event
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>Track</label>
              <select className={inp} value={s.event.track}
                onChange={(e) => patchEvent("track", e.target.value)}>
                <option value="">— Select track —</option>
                {trackOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Car</label>
              <select className={inp} value={s.event.car}
                onChange={(e) => patchEvent("car", e.target.value)}>
                <option value="">— Select car —</option>
                {carOptions.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>Race duration (h:mm:ss)</label>
              <input className={inp} value={s.event.raceDuration}
                onChange={(e) => patchEvent("raceDuration", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Session start (optional)</label>
              <input type="datetime-local" className={inp}
                value={s.event.sessionStartLocal}
                onChange={(e) => patchEvent("sessionStartLocal", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Green-flag offset (m:ss)</label>
              <input className={inp} value={s.event.greenFlagOffset}
                onChange={(e) => patchEvent("greenFlagOffset", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Pit time loss (s)</label>
              <input className={inp} value={s.event.pitLoss}
                onChange={(e) => patchEvent("pitLoss", e.target.value)}
                title="Total time lost at a normal (driver-change) pit stop." />
            </div>
            <div>
              <label className={lbl}>Driver swap (s)</label>
              <input className={inp} value={s.event.driverSwapSec}
                onChange={(e) => patchEvent("driverSwapSec", e.target.value)}
                placeholder="30"
                title="Mandatory driver-swap floor. iRacing = 30s; it runs concurrently with fuelling, so it only costs time when fuelling is shorter than this." />
            </div>
            <div>
              <label className={lbl}>Refuel time (s)</label>
              <input className={inp} value={s.event.refuelSec}
                onChange={(e) => patchEvent("refuelSec", e.target.value)}
                placeholder="e.g. 40"
                title="How long fuelling takes at a full stop. If ≥ driver swap, a swap is hidden under fuelling (free) and double-stinting saves no time." />
            </div>
            <div>
              <label className={lbl}>Fuel tank (L)</label>
              <input className={inp} value={s.event.tankSize}
                onChange={(e) => patchEvent("tankSize", e.target.value)} />
            </div>
            <div>
              <label className={lbl}>Fuel reserve (L)</label>
              <input className={inp} value={s.event.fuelReserve}
                onChange={(e) => patchEvent("fuelReserve", e.target.value)}
                placeholder="0"
                title="Fuel kept in the tank as a safety margin — reduces laps per stint." />
            </div>
            <div>
              <label className={lbl}>Track temp (°C)</label>
              <input className={inp} value={s.event.trackTempC}
                onChange={(e) => patchEvent("trackTempC", e.target.value)}
                onBlur={(e) => applyTempFromInput(e.target.value)}
                placeholder="e.g. 30"
                title="Expected race-day track temperature. Lap times are adjusted to it using the Garage 61 temperature fit (or the manual coefficient). Applied when you leave the field." />
            </div>
            <div>
              <label className={lbl}>Stint length</label>
              <select className={inp} value={s.event.stintMode}
                onChange={(e) => patchEvent("stintMode", e.target.value)}>
                <option value="fuel">Fuel-limited</option>
                <option value="time">Fixed time</option>
                <option value="laps">Fixed laps</option>
              </select>
            </div>
            {s.event.stintMode !== "fuel" && (
              <div>
                <label className={lbl}>
                  {s.event.stintMode === "time" ? "Stint minutes" : "Stint laps"}
                </label>
                <input className={inp} value={s.event.stintValue}
                  onChange={(e) => patchEvent("stintValue", e.target.value)}
                  placeholder={s.event.stintMode === "time" ? "45" : "20"} />
              </div>
            )}
          </div>
          {(s.tempModel || s.event.trackTempC.trim() !== "") && (
            <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/40 p-2.5 text-[11px] text-zinc-400">
              {(() => {
                const tm = s.tempModel;
                const raceT = Number(s.event.trackTempC);
                const hasRaceT =
                  s.event.trackTempC.trim() !== "" && isFinite(raceT);
                if (!tm) {
                  return (
                    <span>
                      Set the expected track temp, then import or pull Garage 61
                      laps — with laps across a range of temps it calibrates how
                      much lap time changes per degree and adjusts the pace.
                    </span>
                  );
                }
                const per10 = round1(tm.slopePerC * 10);
                const pending =
                  hasRaceT && tm.appliedTempC != null
                    ? tm.slopePerC * (raceT - tm.appliedTempC)
                    : 0;
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      Pace set at{" "}
                      <strong className="text-zinc-200">
                        {tm.appliedTempC != null
                          ? `${round1(tm.appliedTempC)}°C`
                          : "—"}
                      </strong>{" "}
                      · sensitivity{" "}
                      <strong className="text-zinc-200">
                        {per10 >= 0 ? "+" : ""}
                        {per10.toFixed(1)} s/10°C
                      </strong>{" "}
                      <span className="text-zinc-500">
                        ({tm.fromData ? "from Garage 61 data" : "manual estimate"})
                      </span>
                    </span>
                    {Math.abs(pending) > 0.05 && (
                      <span className="text-amber-300">
                        → leaving the field shifts lap times{" "}
                        {pending > 0 ? "+" : ""}
                        {pending.toFixed(1)}s for {round1(raceT)}°C
                      </span>
                    )}
                    {!tm.fromData && (
                      <label className="flex items-center gap-1 text-zinc-500 print:hidden">
                        s/10°C:
                        <input
                          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-100"
                          defaultValue={String(per10)}
                          onBlur={(e) => setManualSlopePer10(e.target.value)}
                          title="Manual lap-time sensitivity (seconds per 10°C), used when the data has no temperature spread to fit."
                        />
                      </label>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Wet-weather penalty (applied per-stint in the schedule below) */}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
            <span className="uppercase tracking-wider text-zinc-500">
              Wet penalty
            </span>
            <label className="flex items-center gap-1 text-zinc-400 print:hidden">
              +
              <input
                key={round1(s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC)}
                className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-100"
                defaultValue={String(round1(s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC))}
                onBlur={(e) => setWetDelta(e.target.value)}
                title="Seconds per lap added to stints you mark wet. Measured from your rain laps when available; edit to override."
              />
              s/lap
            </label>
            {s.wetModel && (
              <span className="text-zinc-500">
                ({s.wetModel.fromData ? "measured from rain laps" : "manual estimate"})
              </span>
            )}
            <span className="text-zinc-500">
              — tick the wet stints in the schedule below.
            </span>
          </div>

          {/* Pit strategy: single vs double stints */}
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/40 p-2.5 text-[11px]">
            <label className="flex items-center gap-2 text-zinc-300 print:hidden">
              <input
                type="checkbox"
                checked={s.event.doubleStint}
                onChange={(e) => setDoubleStint(e.target.checked)}
              />
              Double stints (each driver runs 2 stints between swaps)
            </label>
            {(() => {
              const stops = Math.max(0, result.stints.length - 1);
              const swap = Number(s.event.driverSwapSec) || 30;
              const refuelSet = s.event.refuelSec.trim() !== "";
              const refuel = Number(s.event.refuelSec) || 0;
              const saveSec = refuelSet ? Math.max(0, swap - refuel) : 0;
              let sameStops = 0;
              for (let i = 0; i < result.stints.length - 1; i++) {
                const a = result.stints[i].driverId;
                const b = result.stints[i + 1].driverId;
                if (a && b && a === b) sameStops++;
              }
              const doubleSame = Math.ceil(stops / 2);
              const stdLap = parseDurationToSec(s.standard.laptime) || 0;
              const laps = (sec: number) => (stdLap > 0 ? sec / stdLap : 0);
              if (!refuelSet) {
                return (
                  <p className="mt-1 text-zinc-500">
                    Enter a <strong className="text-zinc-400">Refuel time</strong>{" "}
                    above to compare single vs double-stinting (a driver swap only
                    costs time when it&rsquo;s longer than fuelling).
                  </p>
                );
              }
              if (saveSec < 0.05) {
                return (
                  <p className="mt-1 text-amber-300">
                    At {refuel}s refuel the {swap}s swap is hidden under fuelling —
                    a driver change costs no extra time, so double-stinting saves
                    nothing here (decide on driver stamina).
                  </p>
                );
              }
              return (
                <div className="mt-1 space-y-0.5 text-zinc-400">
                  <div>
                    A driver change costs{" "}
                    <strong className="text-zinc-200">+{saveSec.toFixed(0)}s</strong>{" "}
                    (swap {swap}s − refuel {refuel}s).
                  </div>
                  <div>
                    This plan: {sameStops}/{stops} stops refuel-only → saves{" "}
                    <strong className="text-emerald-300">
                      ~{(sameStops * saveSec).toFixed(0)}s (~{laps(sameStops * saveSec).toFixed(1)} laps)
                    </strong>{" "}
                    vs single-stinting.
                  </div>
                  <div className="text-zinc-500">
                    Full double-stint plan: {doubleSame}/{stops} refuel-only → saves
                    ~{(doubleSame * saveSec).toFixed(0)}s (~
                    {laps(doubleSame * saveSec).toFixed(1)} laps). Trade-off: a
                    driver runs two stints back-to-back.
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Fuel profiles */}
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
            Fuel profiles
          </h2>
          <ProfileRow
            title="Standard"
            laptime={s.standard.laptime}
            fuelPerLap={s.standard.fuelPerLap}
            onLaptime={(v) => patchStd("laptime", v)}
            onFuel={(v) => patchStd("fuelPerLap", v)}
            laps={std.laps}
            green={std.greenTimeSec}
            total={std.totalTimeSec}
            fuel={std.fuelPerStint}
          />
          <label className="mt-3 flex items-center gap-2 text-sm text-zinc-300">
            <input type="checkbox" checked={s.savingEnabled}
              onChange={(e) => setS((p) => ({ ...p, savingEnabled: e.target.checked }))} />
            Enable a fuel-saving profile
          </label>
          {s.savingEnabled && sav && (
            <div className="mt-2">
              <ProfileRow
                title="Fuel-saving"
                laptime={s.saving.laptime}
                fuelPerLap={s.saving.fuelPerLap}
                onLaptime={(v) => patchSav("laptime", v)}
                onFuel={(v) => patchSav("fuelPerLap", v)}
                laps={sav.laps}
                green={sav.greenTimeSec}
                total={sav.totalTimeSec}
                fuel={sav.fuelPerStint}
              />
            </div>
          )}
          {(std.overFuel || (sav != null && sav.overFuel)) && (
            <p className="mt-3 text-xs text-amber-400">
              ⚠ This stint length needs more fuel than the usable tank holds.
              Reduce the stint length or fuel reserve, or increase the tank.
            </p>
          )}
        </div>
      </div>

      {/* Fuel-save strategy optimizer */}
      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Fuel-save strategy
          </h2>
          <button
            onClick={runFuelSaveOptimizer}
            className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 print:hidden"
          >
            Optimize
          </button>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          Race time is fixed, so this finds the pace &amp; fuel that covers the
          most distance — trading lap time for fewer pit stops. It uses your
          Standard and Fuel-save profiles as the pace/fuel band, weights the
          pace by your real per-driver lap times (by stints driven), and only
          saves the minimum needed to drop a stop. The best strategy is applied
          straight to the Standard profile, so the schedule below updates.
        </p>
        {fuelSaveMsg && (
          <p className="mb-3 rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
            ✓ {fuelSaveMsg}
          </p>
        )}
        {fuelSaveOpt && !fuelSaveOpt.ok && (
          <p className="text-sm text-amber-400">{fuelSaveOpt.reason}</p>
        )}
        {fuelSaveOpt &&
          fuelSaveOpt.ok &&
          (() => {
            const best = fuelSaveOpt.strategies[fuelSaveOpt.bestIndex];
            const push = fuelSaveOpt.strategies[fuelSaveOpt.fullPushIndex];
            const gain = best.totalLaps - push.totalLaps;
            return (
              <div className="space-y-3">
                <div className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                  Best: <strong>{best.stops} stops</strong> · target lap{" "}
                  <strong>{fmtLap(best.laptimeSec)}</strong> · ≤{" "}
                  {best.fuelPerLap.toFixed(2)} L/lap →{" "}
                  <strong>{best.totalLaps.toFixed(1)} laps</strong>
                  {fuelSaveOpt.bestIndex !== fuelSaveOpt.fullPushIndex
                    ? ` — ${gain > 0 ? "+" : ""}${gain.toFixed(1)} laps vs full push (${push.stops} stops).`
                    : " — full push is optimal here."}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm tabular-nums">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="py-1 pr-2">Stops</th>
                        <th className="py-1 pr-2 text-right">Target lap</th>
                        <th className="py-1 pr-2 text-right">Fuel/lap</th>
                        <th className="py-1 pr-2 text-right">Laps/stint</th>
                        <th className="py-1 pr-2 text-right">Total laps</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fuelSaveOpt.strategies.map((r, i) => (
                        <tr
                          key={r.stops}
                          className={`border-t border-zinc-800/60 ${i === fuelSaveOpt.bestIndex ? "bg-emerald-950/30 text-emerald-200" : "text-zinc-200"}`}
                        >
                          <td className="py-1 pr-2">
                            {r.stops}
                            {i === fuelSaveOpt.bestIndex && (
                              <span className="ml-1 text-[10px] uppercase text-emerald-400">best · applied</span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right">{fmtLap(r.laptimeSec)}</td>
                          <td className="py-1 pr-2 text-right">{r.fuelPerLap.toFixed(2)} L</td>
                          <td className="py-1 pr-2 text-right">{r.lapsPerStint}</td>
                          <td className="py-1 pr-2 text-right">{r.totalLaps.toFixed(1)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-zinc-600">
                  Assumes lap time varies linearly between your two profiles.
                  &ldquo;Total laps&rdquo; is the distance measure (track length is
                  constant).
                </p>
              </div>
            );
          })()}
      </div>

      {/* Drivers */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Drivers
          </h2>
          <ClsDriverPicker
            options={clsDrivers.filter(
              (d) => !s.drivers.some((r) => r.id === d.id)
            )}
            onPick={addClsDriver}
          />
        </div>
        <div className="space-y-2">
          {s.drivers.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <span className="flex-1 rounded border border-zinc-800 bg-zinc-950/60 px-2 py-1.5 text-sm text-zinc-100">
                {d.name}
              </span>
              <input className={`${inp} w-28`} value={d.laptime}
                onChange={(e) => patchDriverLaptime(d.id, e.target.value)}
                placeholder="laptime" title="Optional per-driver laptime (m:ss). Blank = standard pace." />
              <button onClick={() => removeDriver(d.id)}
                className="rounded border border-red-900/60 px-2 py-1.5 text-sm text-red-300 hover:bg-red-950/40 print:hidden"
                aria-label="Remove driver">✕</button>
            </div>
          ))}
          {s.drivers.length === 0 && (
            <p className="text-sm text-zinc-500">
              Search for a CLS driver in the field above to add them.
            </p>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Drivers come from CLS (anyone with a registration). The per-driver
          laptime is optional — set it to lengthen a slower driver&rsquo;s stints
          (fuel &amp; laps stay the same, since a stint is fuel-limited).
        </p>
      </div>

      {/* Garage 61 import */}
      <div className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Garage 61 import
          </h2>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              onClick={onGarage61Pull}
              disabled={g61PullBusy || g61Busy}
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
              title="Fetch your team's laps for the selected Track + Car directly from Garage 61."
            >
              {g61PullBusy ? "Pulling…" : "Pull from Garage 61"}
            </button>
            <label className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {g61Busy ? "Reading…" : "Upload session export(s)"}
              <input
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                disabled={g61Busy || g61PullBusy}
                onChange={(e) => onGarage61Files(e.target.files)}
              />
            </label>
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          <strong className="text-zinc-400">Pull from Garage 61</strong> fetches
          your team&rsquo;s laps for the selected Track + Car straight from the
          Garage 61 API — or upload session exports (.xlsx) manually. Either way,
          real race pace &amp; fuel/lap per driver are read from the practice laps
          and fill the Standard profile plus each matching driver&rsquo;s lap
          time. Only laps from the drivers on this plan (add them under
          <strong className="text-zinc-400"> Drivers</strong> first) are
          included. Uploaded files are read in your browser — nothing is stored.
        </p>

        {/* Connection status + connect (per-plan token) */}
        <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">
              {g61Status?.connected ? (
                <span className="text-emerald-300">
                  ● Connected to Garage 61
                  {g61Status.teamName
                    ? ` · team ${g61Status.teamName}`
                    : " · no team selected"}
                </span>
              ) : g61Status?.globalFallback ? (
                <span className="text-zinc-400">
                  ● Using the site&rsquo;s shared Garage 61 token
                </span>
              ) : (
                <span className="text-zinc-500">● Not connected to Garage 61</span>
              )}
            </span>
            {curId && editToken && (
              <div className="flex items-center gap-2 print:hidden">
                {g61Status?.connected && (
                  <button
                    onClick={onG61Disconnect}
                    disabled={g61ConnBusy}
                    className="rounded border border-red-900/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    Disconnect
                  </button>
                )}
                <button
                  onClick={() => setG61ShowConnect((v) => !v)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {g61Status?.connected ? "Change token" : "Connect my token"}
                </button>
              </div>
            )}
          </div>

          {!curId && (
            <p className="mt-2 text-[11px] text-zinc-500">
              Save &amp; share the plan first to connect your own Garage 61
              account to it.
            </p>
          )}

          {curId && editToken && g61ShowConnect && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-zinc-500">
                Paste a Garage 61 <strong>personal access token</strong> (create
                one at garage61.net/developer). It&rsquo;s encrypted, stored with
                this plan only, and never shown again — anyone with the plan link
                can then pull, but only you (the creator) can change it.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  className={`${inp} max-w-xs`}
                  value={g61Token}
                  onChange={(e) => setG61Token(e.target.value)}
                  placeholder="Garage 61 token"
                  autoComplete="off"
                />
                <button
                  onClick={onG61Connect}
                  disabled={g61ConnBusy}
                  className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
                >
                  {g61ConnBusy ? "Connecting…" : "Connect"}
                </button>
              </div>
              {g61Teams.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                    Team
                  </label>
                  <select
                    className={`${inp} max-w-xs`}
                    value={g61Status?.teamSlug ?? ""}
                    onChange={(e) => onG61PickTeam(e.target.value)}
                    disabled={g61ConnBusy}
                  >
                    <option value="">— Select team —</option>
                    {g61Teams.map((t) => (
                      <option key={t.slug} value={t.slug}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {g61ConnMsg && (
                <p className="text-xs text-amber-300">{g61ConnMsg}</p>
              )}
            </div>
          )}
        </div>

        {g61Msg && <p className="mb-2 text-sm text-amber-300">{g61Msg}</p>}
        {g61 && (
          <div className="space-y-3">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm tabular-nums">
                <thead className="text-zinc-500">
                  <tr className="border-b border-zinc-800">
                    <th className="py-1 pr-2">Driver</th>
                    <th className="py-1 pr-2 text-right">Laps</th>
                    <th className="py-1 pr-2 text-right">Best</th>
                    <th className="py-1 pr-2 text-right">Race pace</th>
                    <th className="py-1 pr-2 text-right">Fuel/lap</th>
                    <th className="py-1 pr-2">In roster</th>
                  </tr>
                </thead>
                <tbody>
                  {g61.drivers.map((d) => {
                    const inRoster = s.drivers.some(
                      (x) =>
                        x.name.trim().toLowerCase() ===
                        d.driver.trim().toLowerCase()
                    );
                    return (
                      <tr key={d.driver} className="border-t border-zinc-800/60 text-zinc-200">
                        <td className="py-1 pr-2">{d.driver}</td>
                        <td className="py-1 pr-2 text-right">{d.laps}</td>
                        <td className="py-1 pr-2 text-right">{fmtLap(d.bestSec)}</td>
                        <td className="py-1 pr-2 text-right">{fmtLap(d.racePaceSec)}</td>
                        <td className="py-1 pr-2 text-right">{d.fuelPerLap.toFixed(2)} L</td>
                        <td className="py-1 pr-2">
                          {inRoster ? (
                            <span className="text-emerald-400">✓</span>
                          ) : (
                            <span className="text-zinc-600">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">
                Standard profile → {fmtLap(g61.overall.laptimeSec)} ·{" "}
                {g61.overall.fuelPerLap.toFixed(2)} L/lap ({g61.overall.cleanLaps}{" "}
                clean laps)
                {g61.temp.sourceTempC != null && (
                  <>
                    {" · "}
                    {g61.temp.slopePerC != null
                      ? `temp fit ${(g61.temp.slopePerC * 10).toFixed(1)} s/10°C (${g61.temp.minTempC?.toFixed(0)}–${g61.temp.maxTempC?.toFixed(0)}°C)`
                      : `all ~${round1(g61.temp.sourceTempC)}°C (no temp spread)`}
                  </>
                )}
              </span>
              <button
                onClick={applyGarage61}
                className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 print:hidden"
              >
                Apply to plan
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Driver performance dashboard (from a Garage 61 pull/import) */}
      {(() => {
        const a = g61 ?? s.g61Analysis;
        return a ? (
          <StintDriverStats
            analysis={a}
            rosterNames={s.drivers.map((d) => d.name)}
          />
        ) : null;
      })()}

      {/* Availability */}
      {s.drivers.length > 0 && hourCount > 0 && (
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-orange-300">
            Availability
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Everyone is available by default — untick an hour to mark a driver
            unavailable. Stint driver &amp; spotter menus only offer drivers
            available for that stint&rsquo;s hour.
          </p>
          <div className="overflow-x-auto">
            <table className="text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-3">Driver</th>
                  {Array.from({ length: hourCount }, (_, h) => (
                    <th key={h} className="px-1.5 py-1 text-center font-normal" title={`Hour ${h + 1}`}>
                      H{h + 1}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {s.drivers.map((d) => (
                  <tr key={d.id} className="border-t border-zinc-800/60">
                    <td className="py-1 pr-3 text-zinc-200 whitespace-nowrap">{d.name}</td>
                    {Array.from({ length: hourCount }, (_, h) => (
                      <td key={h} className="px-1.5 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={!isBlocked(d.id, h)}
                          onChange={() => toggleAvail(d.id, h)}
                          title={`${d.name} — Hour ${h + 1}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pre-Race notes */}
      <div className={card}>
        <label className={lbl}>Pre-Race notes</label>
        <textarea
          className={`${inp} mt-1 h-32 resize-y`}
          value={s.notes["pre"]}
          onChange={(e) => patchNote("pre", e.target.value)}
          placeholder={"Pre-Race notes…"}
        />
      </div>
      </div>
      {/* ===== DURING ===== */}
      <div className={`space-y-6 ${phase === "during" ? "" : "hidden print:block"}`}>
      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Stints" value={String(result.totals.stintCount)} />
        <Stat label="Pit stops" value={String(result.totals.pitStops)} />
        <Stat label="Total laps" value={fmtLaps(result.totals.laps)} />
        <Stat label="Total fuel" value={`${fmtFuel(result.totals.fuel)} L`} />
        <Stat label="Drivers" value={String(result.totals.driverCount)} />
        <Stat
          label="Projected finish"
          value={lastStint ? fmtDuration(lastStint.endSec) : "—"}
        />
      </div>
      {lastStint && (
        <p className="-mt-2 text-xs text-zinc-500">
          Fair share ≈ {result.fairShareStints ?? "—"} stints each. “Projected
          finish” is the race-clock time the plan currently ends at — it moves
          away from the race length as you enter ± corrections during the race.
        </p>
      )}

      {/* Live "now" banner */}
      {raceLive && result.raceStartUtcMs != null && lastStint && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm">
          {now < result.raceStartUtcMs ? (
            <span className="text-emerald-300">
              ● Green flag in{" "}
              <span className="font-semibold tabular-nums">
                {fmtCountdown(result.raceStartUtcMs - now)}
              </span>
            </span>
          ) : lastStint.wallEndMs != null && now >= lastStint.wallEndMs ? (
            <span className="text-zinc-400">● Race finished</span>
          ) : currentStint ? (
            <span className="text-emerald-300">
              ● LIVE — Stint {currentStint.index}
              {currentStint.driverName ? ` · ${currentStint.driverName}` : ""} ·
              next pit in{" "}
              <span className="font-semibold tabular-nums">
                {fmtCountdown((currentStint.wallEndMs ?? now) - now)}
              </span>
              {currentStint.wallEndMs != null &&
                ` (${fmtClock(currentStint.wallEndMs)})`}
            </span>
          ) : (
            <span className="text-emerald-300">● LIVE</span>
          )}
        </div>
      )}

      {/* Schedule / pit timeline */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Stint schedule &amp; pit timeline
          </h2>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <div className="flex items-center gap-1 rounded border border-sky-900/50 bg-sky-950/20 px-2 py-1 text-xs text-sky-200">
              <span title="Mark this stint and all later stints as wet.">☔ Rain from stint</span>
              <input
                type="number"
                min={1}
                value={rainFromStr}
                onChange={(e) => setRainFromStr(e.target.value)}
                placeholder="#"
                className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <button
                onClick={() => {
                  const n = Number(rainFromStr);
                  if (isFinite(n) && n >= 1) setRainFromStint(n - 1);
                }}
                className="rounded bg-sky-800 px-1.5 py-0.5 text-white hover:bg-sky-700"
              >
                Apply
              </button>
              <button
                onClick={clearWetStints}
                className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
                title="Clear all wet flags"
              >
                All dry
              </button>
            </div>
            <div className="flex items-center gap-1 rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1 text-xs text-amber-200">
              <span title="Fill every stint with a track-temperature ramp: start → peak → end. Leave the peak empty for one straight line. Correct single stints afterwards.">
                🌡 Temp ramp
              </span>
              <input
                type="number"
                step="0.5"
                value={tempRampFrom}
                onChange={(e) => setTempRampFrom(e.target.value)}
                placeholder="start"
                title="Track temperature at the green flag"
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <span className="text-amber-300/70">↗</span>
              <input
                type="number"
                step="0.5"
                value={tempRampPeak}
                onChange={(e) => setTempRampPeak(e.target.value)}
                placeholder="peak"
                title="Hottest track temperature of the race — leave empty for a straight start-to-end ramp"
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <input
                type="number"
                min={1}
                value={tempRampPeakAt}
                onChange={(e) => setTempRampPeakAt(e.target.value)}
                placeholder="@#"
                title="Stint the peak falls in (default: the middle stint)"
                className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <span className="text-amber-300/70">↘</span>
              <input
                type="number"
                step="0.5"
                value={tempRampTo}
                onChange={(e) => setTempRampTo(e.target.value)}
                placeholder="end"
                title="Track temperature at the chequered flag"
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <button
                onClick={applyTempRamp}
                className="rounded bg-amber-700 px-1.5 py-0.5 text-white hover:bg-amber-600"
              >
                Apply
              </button>
              <button
                onClick={clearStintTemps}
                className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
                title="Clear every per-stint temperature (back to the plan's Track temp)"
              >
                Clear
              </button>
            </div>
            <button onClick={autoFill}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              Auto-fill drivers
            </button>
            <button onClick={clearAssignments}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              Clear
            </button>
          </div>
        </div>
        {result.stints.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Enter a race duration, lap time, fuel per lap and tank size to
            generate the schedule.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Driver</th>
                  <th className="py-1 pr-2">Spotter</th>
                  {s.savingEnabled && <th className="py-1 pr-2">Profile</th>}
                  <th className="py-1 pr-2 text-right">Race start</th>
                  {showClock && <th className="py-1 pr-2 text-right">Clock in</th>}
                  <th className="py-1 pr-2 text-right">Race end</th>
                  <th className="py-1 pr-2 text-right" title="Live correction in minutes (±). Cascades to later stints.">±min</th>
                  <th className="py-1 pr-2 text-right">Length</th>
                  <th className="py-1 pr-2 text-right">Laps</th>
                  <th className="py-1 pr-2 text-right">Fuel</th>
                  <th className="py-1 pr-2 text-right" title="Track temperature for this stint. Empty = the plan's Track temp, i.e. exactly the entered pace.">°C</th>
                  <th className="py-1 pr-2 text-center" title="Tick stints run in the rain — they get the wet penalty per lap.">Wet</th>
                  <th className="py-1 pr-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {result.stints.map((st, i) => {
                  const a = assignmentAt(i);
                  const driverOpts = s.drivers.filter(
                    (d) =>
                      driverFreeForStint(d.id, st.startSec, st.endSec) ||
                      d.id === a.driverId
                  );
                  const spotterOpts = s.drivers.filter(
                    (d) =>
                      d.id !== a.driverId &&
                      (driverFreeForStint(d.id, st.startSec, st.endSec) ||
                        d.id === a.spotterId)
                  );
                  const spotterName =
                    s.drivers.find((d) => d.id === a.spotterId)?.name ?? null;
                  return (
                    <tr key={i} className={`border-t border-zinc-800/60 text-zinc-200 ${i === currentIdx ? "bg-emerald-950/30 ring-1 ring-inset ring-emerald-600/50" : st.wet ? "bg-sky-950/20" : st.correctionMin ? "bg-amber-950/20" : ""}`}>
                      <td className="py-1 pr-2 text-zinc-500">
                        {st.index}
                        {st.partial && (
                          <span className="ml-1 text-[10px] uppercase text-amber-400">fin</span>
                        )}
                      </td>
                      <td className="py-1 pr-2 print:hidden">
                        <select
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                          value={a.driverId ?? ""}
                          onChange={(e) => {
                            const v = e.target.value || null;
                            setAssignment(i, {
                              driverId: v,
                              ...(a.spotterId && a.spotterId === v
                                ? { spotterId: null }
                                : {}),
                            });
                          }}
                        >
                          <option value="">— Unassigned —</option>
                          {driverOpts.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="hidden py-1 pr-2 print:table-cell">
                        {st.driverName ?? "—"}
                      </td>
                      <td className="py-1 pr-2 print:hidden">
                        <select
                          className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                          value={a.spotterId ?? ""}
                          onChange={(e) => setAssignment(i, { spotterId: e.target.value || null })}
                        >
                          <option value="">— none —</option>
                          {spotterOpts.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="hidden py-1 pr-2 print:table-cell">
                        {spotterName ?? "—"}
                      </td>
                      {s.savingEnabled && (
                        <td className="py-1 pr-2 print:hidden">
                          <select
                            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                            value={a.profile}
                            onChange={(e) => setAssignment(i, { profile: e.target.value as StintProfileKey })}
                          >
                            <option value="standard">Std</option>
                            <option value="saving">FS</option>
                          </select>
                        </td>
                      )}
                      <td className="py-1 pr-2 text-right text-zinc-400">{fmtDuration(st.startSec)}</td>
                      {showClock && (
                        <td className="py-1 pr-2 text-right text-zinc-400">{fmtClock(st.wallStartMs)}</td>
                      )}
                      <td className="py-1 pr-2 text-right text-zinc-400">{fmtDuration(st.endSec)}</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          type="number"
                          step="0.5"
                          value={a.correctionMin ?? 0}
                          onChange={(e) =>
                            setAssignment(i, {
                              correctionMin: e.target.value === "" ? 0 : Number(e.target.value),
                            })
                          }
                          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right text-sm text-zinc-100"
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">
                        {st.correctionMin
                          ? st.correctionMin > 0
                            ? `+${st.correctionMin}`
                            : st.correctionMin
                          : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right">{fmtDuration(st.endSec - st.startSec)}</td>
                      <td className="py-1 pr-2 text-right">{fmtLaps(st.laps)}</td>
                      <td className="py-1 pr-2 text-right">{fmtFuel(st.fuel)} L</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          type="number"
                          step="0.5"
                          value={a.trackTempC ?? ""}
                          placeholder={
                            s.event.trackTempC.trim() !== ""
                              ? s.event.trackTempC
                              : "—"
                          }
                          onChange={(e) =>
                            setAssignment(i, {
                              trackTempC:
                                e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          title={
                            st.tempDeltaSec
                              ? `${st.tempDeltaSec > 0 ? "+" : ""}${st.tempDeltaSec.toFixed(2)} s/lap vs the plan's base temperature`
                              : "Track temperature for this stint (blank = base temp)"
                          }
                          className={`w-16 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                            st.tempDeltaSec > 0
                              ? "border-red-800/70 text-red-200"
                              : st.tempDeltaSec < 0
                                ? "border-emerald-800/70 text-emerald-200"
                                : "border-zinc-700 text-zinc-100"
                          }`}
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">
                        {st.trackTempC != null ? `${st.trackTempC}°` : "—"}
                      </td>
                      <td className="py-1 pr-2 text-center print:hidden">
                        <input
                          type="checkbox"
                          checked={!!a.wet}
                          onChange={(e) => setAssignment(i, { wet: e.target.checked })}
                          title="This stint runs in the wet"
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-center text-sky-300 print:table-cell">
                        {st.wet ? "WET" : ""}
                      </td>
                      <td className="py-1 pr-2 print:hidden">
                        <input
                          type="text"
                          value={a.note ?? ""}
                          onChange={(e) => setAssignment(i, { note: e.target.value })}
                          placeholder="incident, weather, SC…"
                          className="w-44 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-sm text-zinc-100"
                        />
                      </td>
                      <td className="hidden max-w-[16rem] py-1 pr-2 align-top text-zinc-300 print:table-cell">
                        {a.note?.trim() ? a.note : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Per-driver totals */}
      {result.perDriver.length > 0 && (
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
            Per-driver totals
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2">Driver</th>
                  <th className="py-1 pr-2 text-right">Stints</th>
                  <th className="py-1 pr-2 text-right">Drive time</th>
                  <th className="py-1 pr-2 text-right">Laps</th>
                  <th className="py-1 pr-2 text-right">Fuel</th>
                </tr>
              </thead>
              <tbody>
                {result.perDriver.map((d) => (
                  <tr key={d.driverId} className="border-t border-zinc-800/60 text-zinc-200">
                    <td className="py-1 pr-2">{d.name}</td>
                    <td className="py-1 pr-2 text-right">{d.stints}</td>
                    <td className="py-1 pr-2 text-right">{fmtDuration(d.driveSec)}</td>
                    <td className="py-1 pr-2 text-right">{fmtLaps(d.laps)}</td>
                    <td className="py-1 pr-2 text-right">{fmtFuel(d.fuel)} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* During-Race notes */}
      <div className={card}>
        <label className={lbl}>During-Race notes</label>
        <textarea
          className={`${inp} mt-1 h-32 resize-y`}
          value={s.notes["during"]}
          onChange={(e) => patchNote("during", e.target.value)}
          placeholder={"During-Race notes…"}
        />
      </div>
      </div>
      {/* ===== POST ===== */}
      <div className={`space-y-6 ${phase === "post" ? "" : "hidden print:block"}`}>
      {/* Race-logger JSONL: what the car actually did */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Race log (pace & stints)
          </h2>
          <label className="print:hidden cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            {uploadingLog
              ? "Parsing…"
              : s.raceLog
                ? "Replace race-log .jsonl"
                : "Upload race-log .jsonl"}
            <input
              type="file"
              accept=".jsonl,.log,.ndjson,application/x-ndjson,text/plain"
              className="hidden"
              disabled={uploadingLog}
              onChange={(e) => onRaceLogFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {logError && (
          <p className="mb-3 rounded border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {logError}
          </p>
        )}
        {!s.raceLog ? (
          <p className="text-sm text-zinc-500">
            Upload the race-logger{" "}
            <span className="font-mono">.jsonl</span> from the session to see the
            pace each driver actually ran, the real stint lengths and pit-stop
            times — and to feed those numbers straight back into the plan.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a
                href={s.raceLog.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="text-orange-300 underline hover:text-orange-200"
              >
                ⬇ {s.raceLog.name}
              </a>
              <span className="text-zinc-500">
                {[
                  s.raceLog.track,
                  s.raceLog.sessionName,
                  s.raceLog.ownCarNumber ? `car #${s.raceLog.ownCarNumber}` : null,
                  s.raceLog.ownCarClass,
                  s.raceLog.trackTempC != null
                    ? `track ${s.raceLog.trackTempC} °C`
                    : null,
                  s.raceLog.classBestSec != null
                    ? `class best ${fmtSec(s.raceLog.classBestSec)}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <div className="print:hidden ml-auto flex flex-wrap gap-2">
                <button
                  onClick={applyLogPaceToDrivers}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Use measured pace for drivers
                </button>
                {s.raceLog.trackTempC != null && (
                  <button
                    onClick={applyLogTrackTemp}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    Use track temp
                  </button>
                )}
                <button
                  onClick={removeRaceLog}
                  className="text-xs text-red-300/80 hover:text-red-200"
                >
                  Remove
                </button>
              </div>
            </div>

            {s.raceLog.stints.length > 0 &&
              (s.eventResult?.ownDrivers?.length ?? 0) === 0 &&
              s.eventResult != null && (
                <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  This event result was uploaded before team-driver splitting
                  existed. Upload the{" "}
                  <span className="font-mono">eventresult.json</span> again to
                  break the log down per driver.
                </p>
              )}
            {raceLogNeedsReparse && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                <span>
                  This log was analysed before lap timestamps were stored, so it
                  can&apos;t be matched to the driver order in your stint
                  schedule — the dashboard is falling back to a reconstruction.
                  The raw file is still archived; one click fixes it.
                </span>
                <button
                  onClick={reanalyseRaceLog}
                  disabled={uploadingLog}
                  className="print:hidden shrink-0 rounded bg-amber-500 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {uploadingLog ? "Re-analysing…" : "Re-analyse log"}
                </button>
              </div>
            )}
            {s.raceLog.stints.length > 0 && s.eventResult == null && (
              <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                For a team race, also upload the{" "}
                <span className="font-mono">eventresult.json</span> above — the
                race logger records only one driver name per car, so the split
                per team driver comes from there.
              </p>
            )}
            <RaceLogDashboard
              log={s.raceLog}
              teamDrivers={s.eventResult?.ownDrivers}
              planStints={result.stints.map((st) => ({
                startSec: st.startSec,
                endSec: st.endSec,
                driverName: st.driverName,
              }))}
            />

          </div>
        )}
      </div>
      {/* End-of-session eventresult */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Event result
          </h2>
          <label className="print:hidden cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            {uploadingResult
              ? "Parsing…"
              : s.eventResult
                ? "Replace eventresult.json"
                : "Upload eventresult.json"}
            <input
              type="file"
              accept=".json,application/json"
              className="hidden"
              disabled={uploadingResult}
              onChange={(e) => onEventResultFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
        {resultError && (
          <p className="mb-3 rounded border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {resultError}
          </p>
        )}
        {!s.eventResult ? (
          <p className="text-sm text-zinc-500">
            After the session, upload the iRacing{" "}
            <span className="font-mono">eventresult.json</span> to archive it with
            this plan and show the finishing order. Team events are listed per
            team; your own entry is highlighted.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <a
                href={s.eventResult.url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="text-orange-300 underline hover:text-orange-200"
              >
                ⬇ {s.eventResult.name}
              </a>
              <button
                onClick={removeEventResult}
                className="print:hidden text-xs text-red-300/80 hover:text-red-200"
              >
                Remove
              </button>
            </div>
            {s.eventResult.summary.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm tabular-nums">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="py-1 pr-2">Pos</th>
                      {resultHasClasses && (
                        <>
                          <th className="py-1 pr-2">Class</th>
                          <th className="py-1 pr-2">Cls</th>
                        </>
                      )}
                      <th className="py-1 pr-2">#</th>
                      <th className="py-1 pr-2">
                        {resultIsTeamEvent ? "Team / drivers" : "Driver"}
                      </th>
                      <th className="py-1 pr-2">Car</th>
                      <th className="py-1 pr-2 text-right">Laps</th>
                      <th className="py-1 pr-2 text-right">Best</th>
                      <th className="py-1 pr-2 text-right">Inc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleResultRows.map((r, i) => (
                      <tr
                        key={i}
                        className={`border-t border-zinc-800/60 ${
                          r.own
                            ? "bg-orange-950/40 font-semibold text-orange-100"
                            : "text-zinc-200"
                        }`}
                      >
                        <td className="py-1 pr-2">{r.pos ?? r.status}</td>
                        {resultHasClasses && (
                          <>
                            <td className="py-1 pr-2 text-zinc-400">
                              {r.carClass ?? "—"}
                            </td>
                            <td className="py-1 pr-2">{r.classPos ?? "—"}</td>
                          </>
                        )}
                        <td className="py-1 pr-2 text-zinc-500">{r.carNumber ?? "—"}</td>
                        <td className="py-1 pr-2">
                          {r.name}
                          {r.drivers && r.drivers.length > 0 && (
                            <span className="block text-xs font-normal text-zinc-500">
                              {r.drivers.join(", ")}
                            </span>
                          )}
                        </td>
                        <td className="py-1 pr-2 text-zinc-400">{r.car ?? "—"}</td>
                        <td className="py-1 pr-2 text-right">{r.laps}</td>
                        <td className="py-1 pr-2 text-right text-zinc-400">
                          {r.bestLapMs ? fmtSec(r.bestLapMs / 1000) : "—"}
                        </td>
                        <td className="py-1 pr-2 text-right">{r.incidents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleResultRows.length < s.eventResult.summary.length ? (
                  <button
                    onClick={() => setShowAllResults(true)}
                    className="print:hidden mt-2 text-xs text-orange-300 underline hover:text-orange-200"
                  >
                    Show all {s.eventResult.summary.length} entries
                  </button>
                ) : (
                  s.eventResult.summary.length > 12 && (
                    <button
                      onClick={() => setShowAllResults(false)}
                      className="print:hidden mt-2 text-xs text-zinc-400 underline hover:text-zinc-300"
                    >
                      Show our class only
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post-Race notes */}
      <div className={card}>
        <label className={lbl}>Post-Race notes</label>
        <textarea
          className={`${inp} mt-1 h-32 resize-y`}
          value={s.notes["post"]}
          onChange={(e) => patchNote("post", e.target.value)}
          placeholder={"Post-Race notes…"}
        />
      </div>
      </div>
    </div>
  );
}

// ---- Small presentational helpers ----------------------------------------

/** Fold accents so "Grosse" finds "Große" and "Muller" finds "Müller". */
const foldName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\u00df/g, "ss")
    .toLowerCase()
    .trim();

/**
 * Type-ahead picker for the CLS driver list.
 *
 * The list is every driver with a registration — hundreds of entries — so a
 * plain <select> means scrolling for a name you already know. Type two letters
 * instead: matches on any part of the name, first-name and last-name starts
 * rank first, ↑/↓ + Enter to add, Esc to close. The field keeps focus after a
 * pick so a whole line-up goes in without touching the mouse.
 */
function ClsDriverPicker({
  options,
  onPick,
}: {
  options: ClsDriverOption[];
  onPick: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const MAX_HITS = 8;
  const matches = useMemo(() => {
    const q = foldName(query);
    if (q === "") return [];
    const scored = options
      .map((d) => {
        const folded = foldName(d.name);
        const idx = folded.indexOf(q);
        if (idx < 0) return null;
        // A name part starting with the query beats a match in the middle.
        const startsPart = folded
          .split(/\s+/)
          .some((part) => part.startsWith(q));
        return { d, rank: idx === 0 ? 0 : startsPart ? 1 : 2 };
      })
      .filter((x): x is { d: ClsDriverOption; rank: number } => x != null)
      .sort((a, b) => a.rank - b.rank || a.d.name.localeCompare(b.d.name));
    return scored.slice(0, MAX_HITS).map((x) => x.d);
  }, [options, query]);

  const pick = (d: ClsDriverOption | undefined) => {
    if (!d) return;
    onPick(d.id);
    setQuery("");
    setHighlight(0);
    // Stay open and focused: adding three drivers is three words, not three
    // trips to the mouse.
    inputRef.current?.focus();
  };

  return (
    <div className="relative print:hidden">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
        aria-controls="cls-driver-hits"
        value={query}
        placeholder="🔍 Add driver — type a name…"
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // A click on a hit fires mousedown first, so the list is still there.
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setHighlight((h) => Math.min(h + 1, matches.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            pick(matches[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        className="w-64 rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-orange-500 focus:outline-none"
      />
      {open && query.trim() !== "" && (
        <ul
          id="cls-driver-hits"
          role="listbox"
          className="absolute right-0 z-30 mt-1 max-h-72 w-72 overflow-auto rounded border border-zinc-700 bg-zinc-900 py-1 shadow-xl"
        >
          {matches.length === 0 ? (
            <li className="px-3 py-2 text-sm text-zinc-500">
              No CLS driver matches “{query.trim()}”.
            </li>
          ) : (
            matches.map((d, i) => (
              <li key={d.id} role="option" aria-selected={i === highlight}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    pick(d);
                  }}
                  onMouseEnter={() => setHighlight(i)}
                  className={`block w-full px-3 py-1.5 text-left text-sm ${
                    i === highlight
                      ? "bg-orange-600/20 text-orange-100"
                      : "text-zinc-200 hover:bg-zinc-800"
                  }`}
                >
                  {d.name}
                </button>
              </li>
            ))
          )}
          {options.length > 0 && (
            <li className="border-t border-zinc-800 px-3 pt-1.5 pb-1 text-[11px] text-zinc-600">
              {options.length} CLS drivers available · ↑↓ + Enter
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

function ProfileRow({
  title,
  laptime,
  fuelPerLap,
  onLaptime,
  onFuel,
  laps,
  green,
  total,
  fuel,
}: {
  title: string;
  laptime: string;
  fuelPerLap: string;
  onLaptime: (v: string) => void;
  onFuel: (v: string) => void;
  laps: number;
  green: number;
  total: number;
  fuel: number;
}) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>Lap time (m:ss)</label>
          <input className={inp} value={laptime}
            onChange={(e) => onLaptime(e.target.value)} />
        </div>
        <div>
          <label className={lbl}>Fuel / lap (L)</label>
          <input className={inp} value={fuelPerLap}
            onChange={(e) => onFuel(e.target.value)} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span><span className="text-zinc-500">Laps/stint:</span> {laps}</span>
        <span><span className="text-zinc-500">On-track:</span> {fmtDuration(green)}</span>
        <span><span className="text-zinc-500">+pit:</span> {fmtDuration(total)}</span>
        <span><span className="text-zinc-500">Fuel/stint:</span> {fuel.toFixed(1)} L</span>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3 text-center">
      <div className="text-[11px] uppercase tracking-wider text-zinc-500">{label}</div>
      <div className="mt-0.5 text-lg font-semibold text-zinc-100">{value}</div>
    </div>
  );
}
