"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  buildSchedule,
  fmtDuration,
  type StintProfileKey,
} from "@/lib/stint-planner";
import { createStintPlan, updateStintPlan } from "@/lib/actions/stint-plans";
import {
  stateToInput,
  uid,
  type PlannerAssignmentState,
  type PlannerState,
} from "@/lib/stint-plan-state";

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
}: {
  initial: PlannerState;
  planId?: string | null;
}) {
  const [s, setS] = useState<PlannerState>(initial);
  const [curId, setCurId] = useState<string | null>(planId);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // The edit token (only the plan's creator holds it) is read live from local
  // storage via useSyncExternalStore — SSR-safe (no hydration mismatch) and it
  // re-reads after we save a plan and update curId.
  const editToken = useSyncExternalStore(
    emptyStoreSubscribe,
    () => (curId ? window.localStorage.getItem(`stintplan:${curId}`) : null),
    () => null
  );

  const result = useMemo(() => buildSchedule(stateToInput(s)), [s]);

  // ---- state helpers ----
  const patchEvent = (k: keyof PlannerState["event"], v: string) =>
    setS((p) => ({ ...p, event: { ...p.event, [k]: v } }));
  const patchStd = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, standard: { ...p.standard, [k]: v } }));
  const patchSav = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, saving: { ...p.saving, [k]: v } }));

  const addDriver = () =>
    setS((p) => ({
      ...p,
      drivers: [
        ...p.drivers,
        { id: uid(), name: `Driver ${p.drivers.length + 1}`, laptime: "" },
      ],
    }));
  const patchDriver = (id: string, k: "name" | "laptime", v: string) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => (d.id === id ? { ...d, [k]: v } : d)),
    }));
  const removeDriver = (id: string) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.filter((d) => d.id !== id),
      assignments: p.assignments.map((a) =>
        a.driverId === id ? { ...a, driverId: null } : a
      ),
    }));

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
        });
      return { ...p, assignments: next };
    });
  const clearAssignments = () => setS((p) => ({ ...p, assignments: [] }));

  const shareUrl =
    typeof window !== "undefined" && curId
      ? `${window.location.origin}/stint-planner/${curId}`
      : null;
  const canEditCurrent = !!curId && !!editToken;

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
          <button
            onClick={() => savePlan(false)}
            disabled={saving}
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : canEditCurrent ? "Save" : "Save & share"}
          </button>
          {canEditCurrent && (
            <button
              onClick={() => savePlan(true)}
              disabled={saving}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Save as new
            </button>
          )}
          {shareUrl && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Copy link
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
        </div>
      </div>

      {/* Drivers */}
      <div className={card}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            Drivers
          </h2>
          <button onClick={addDriver}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 print:hidden">
            + Add driver
          </button>
        </div>
        <div className="space-y-2">
          {s.drivers.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <input className={`${inp} flex-1`} value={d.name}
                onChange={(e) => patchDriver(d.id, "name", e.target.value)}
                placeholder="Driver name" />
              <input className={`${inp} w-28`} value={d.laptime}
                onChange={(e) => patchDriver(d.id, "laptime", e.target.value)}
                placeholder="laptime" title="Optional per-driver laptime (m:ss). Blank = standard pace." />
              <button onClick={() => removeDriver(d.id)}
                className="rounded border border-red-900/60 px-2 py-1.5 text-sm text-red-300 hover:bg-red-950/40 print:hidden"
                aria-label="Remove driver">✕</button>
            </div>
          ))}
          {s.drivers.length === 0 && (
            <p className="text-sm text-zinc-500">Add at least one driver.</p>
          )}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Per-driver laptime is optional — set it to lengthen a slower driver&rsquo;s
          stints (fuel &amp; laps stay the same, since a stint is fuel-limited).
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Stints" value={String(result.totals.stintCount)} />
        <Stat label="Pit stops" value={String(result.totals.pitStops)} />
        <Stat label="Total laps" value={fmtLaps(result.totals.laps)} />
        <Stat label="Total fuel" value={`${fmtFuel(result.totals.fuel)} L`} />
        <Stat label="Drivers" value={String(result.totals.driverCount)} />
        <Stat
          label="Fair share"
          value={result.fairShareStints ? `${result.fairShareStints} ea.` : "—"}
        />
      </div>

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
                  {s.savingEnabled && <th className="py-1 pr-2">Profile</th>}
                  <th className="py-1 pr-2 text-right">Race start</th>
                  {showClock && <th className="py-1 pr-2 text-right">Clock in</th>}
                  <th className="py-1 pr-2 text-right">Race end</th>
                  <th className="py-1 pr-2 text-right">Length</th>
                  <th className="py-1 pr-2 text-right">Laps</th>
                  <th className="py-1 pr-2 text-right">Fuel</th>
                </tr>
              </thead>
              <tbody>
                {result.stints.map((st, i) => {
                  const a = assignmentAt(i);
                  return (
                    <tr key={i} className="border-t border-zinc-800/60 text-zinc-200">
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
                          onChange={(e) => setAssignment(i, { driverId: e.target.value || null })}
                        >
                          <option value="">— Unassigned —</option>
                          {s.drivers.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="hidden py-1 pr-2 print:table-cell">
                        {st.driverName ?? "—"}
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
                      <td className="py-1 pr-2 text-right">{fmtDuration(st.endSec - st.startSec)}</td>
                      <td className="py-1 pr-2 text-right">{fmtLaps(st.laps)}</td>
                      <td className="py-1 pr-2 text-right">{fmtFuel(st.fuel)} L</td>
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
