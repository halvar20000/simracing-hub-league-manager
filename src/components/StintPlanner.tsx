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
import { postStintPlanToDiscord } from "@/lib/actions/stint-plan-discord";
import {
  hydratePlanState,
  stateToInput,
  DEFAULT_TEMP_SLOPE_PER_C,
  type PlannerAssignmentState,
  type PlannerState,
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
import {
  connectGarage61,
  setGarage61Team,
  disconnectGarage61,
  getGarage61Status,
  type G61TeamOption,
  type G61Status,
} from "@/lib/actions/garage61-connect";

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
        const res = await liveUpdateStintPlan(curId, s.title, s);
        if (res.ok) {
          lastSavedSnapshotRef.current = snap;
          baseUpdatedAtRef.current = res.updatedAt;
          setSyncStatus("saved");
        } else {
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

  const autoFill = () =>
    setS((p) => {
      if (p.drivers.length === 0) return p;
      const n = Math.max(result.stints.length, p.assignments.length);
      const next: PlannerAssignmentState[] = [];
      for (let i = 0; i < n; i++)
        next.push({
          profile: p.assignments[i]?.profile ?? "standard",
          driverId: p.drivers[i % p.drivers.length].id,
          correctionMin: p.assignments[i]?.correctionMin ?? 0,
        });
      return { ...p, assignments: next };
    });
  const clearAssignments = () => setS((p) => ({ ...p, assignments: [] }));

  const patchNote = (k: "pre" | "during" | "post", v: string) =>
    setS((p) => ({ ...p, notes: { ...p.notes, [k]: v } }));

  const [uploadingResult, setUploadingResult] = useState(false);
  async function onEventResultFile(file: File | null) {
    if (!file) return;
    setUploadingResult(true);
    setStatus(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadStintPlanEventResult(fd);
      if (!res.ok) {
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
        },
      }));
      setStatus("Eventresult parsed. Click Save to keep it with the plan.");
    } finally {
      setUploadingResult(false);
    }
  }
  const removeEventResult = () =>
    setS((p) => ({ ...p, eventResult: null }));

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
        if (cLap < 0 || cDrv < 0 || cFuel < 0) continue;
        for (let i = 1; i < grid.length; i++) {
          const r = grid[i] as unknown[];
          const drv = String(r[cDrv] ?? "").trim();
          const rawLap = Number(r[cLap]);
          const fuel = Number(r[cFuel]);
          if (!drv || !isFinite(rawLap) || !isFinite(fuel)) continue;
          const rawTemp = cTemp >= 0 ? Number(r[cTemp]) : NaN;
          rows.push({
            driver: drv,
            laptimeSec: rawLap * 86400, // Excel duration = fraction of a day
            fuelUsed: fuel,
            pitIn: Number(cPin >= 0 ? r[cPin] : 0) === 1,
            pitOut: Number(cPout >= 0 ? r[cPout] : 0) === 1,
            trackTempC: isFinite(rawTemp) ? rawTemp : null,
          });
        }
      }
      if (rows.length === 0) {
        setG61Msg(
          "No lap data found — is this a Garage 61 session export (.xlsx)?"
        );
        return;
      }
      const result = aggregateGarage61Laps(rows);
      if (result.drivers.length === 0) {
        setG61Msg("Couldn't derive clean laps from the file(s).");
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

    setS((p) => ({
      ...p,
      event: {
        ...p.event,
        trackTempC:
          targetTemp != null ? String(round1(targetTemp)) : p.event.trackTempC,
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

  return (
    <div className="space-y-6">
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
                onChange={(e) => patchEvent("pitLoss", e.target.value)} />
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
          <select
            value=""
            onChange={(e) => addClsDriver(e.target.value)}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 print:hidden"
          >
            <option value="">+ Add CLS driver…</option>
            {clsDrivers
              .filter((d) => !s.drivers.some((r) => r.id === d.id))
              .map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
          </select>
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
              Add drivers from CLS using the menu above.
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
          time. Uploaded files are read in your browser — nothing is stored.
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
        return a ? <StintDriverStats analysis={a} /> : null;
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
          <div className="flex gap-2 print:hidden">
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
                    <tr key={i} className={`border-t border-zinc-800/60 text-zinc-200 ${i === currentIdx ? "bg-emerald-950/30 ring-1 ring-inset ring-emerald-600/50" : st.correctionMin ? "bg-amber-950/20" : ""}`}>
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

      {/* Race notes */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          Comments
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {(
            [
              ["pre", "Pre-Race"],
              ["during", "During-Race"],
              ["post", "Post-Race"],
            ] as const
          ).map(([k, label]) => (
            <div key={k}>
              <label className={lbl}>{label}</label>
              <textarea
                className={`${inp} mt-1 h-32 resize-y`}
                value={s.notes[k]}
                onChange={(e) => patchNote(k, e.target.value)}
                placeholder={`${label} notes…`}
              />
            </div>
          ))}
        </div>
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
        {!s.eventResult ? (
          <p className="text-sm text-zinc-500">
            After the session, upload the iRacing{" "}
            <span className="font-mono">eventresult.json</span> to archive it with
            this plan and show the finishing order. Remember to Save afterwards.
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
                      <th className="py-1 pr-2">#</th>
                      <th className="py-1 pr-2">Driver</th>
                      <th className="py-1 pr-2">Car</th>
                      <th className="py-1 pr-2 text-right">Laps</th>
                      <th className="py-1 pr-2 text-right">Inc</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.eventResult.summary.map((r, i) => (
                      <tr key={i} className="border-t border-zinc-800/60 text-zinc-200">
                        <td className="py-1 pr-2">{r.pos ?? r.status}</td>
                        <td className="py-1 pr-2 text-zinc-500">{r.carNumber ?? "—"}</td>
                        <td className="py-1 pr-2">{r.name}</td>
                        <td className="py-1 pr-2 text-zinc-400">{r.car ?? "—"}</td>
                        <td className="py-1 pr-2 text-right">{r.laps}</td>
                        <td className="py-1 pr-2 text-right">{r.incidents}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Small presentational helpers ----------------------------------------

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
