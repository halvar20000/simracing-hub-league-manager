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
  fuelSaveTargets,
  optimizeFuelSave,
  parseDurationToSec,
  pitStopSeconds,
  conditionOf,
  type PitModel,
  type PitStopBreakdown,
  type StintCondition,
  type FuelSaveOptimization,
  type StintProfileKey,
} from "@/lib/stint-planner";
import {
  createStintPlan,
  updateStintPlan,
  liveUpdateStintPlan,
  getStintPlanLive,
  setStintPlanArchived,
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
  uid,
  planPitModel,
  fullServiceStopSec,
  planLapTarget,
  parseTypedNumber,
  isDeltaSaving,
  rainProfileOf,
  savingDeltas,
  halfWetDeltaSec,
  wetDeltaSecOf,
  DEFAULT_HALF_WET_FRACTION,
  DEFAULT_TEMP_SLOPE_PER_C,
  DEFAULT_WET_DELTA_SEC,
  type PlannerAssignmentState,
  type PlannerState,
  type RaceLogDriverRow,
  MAX_IMPRESSIONS,
} from "@/lib/stint-plan-state";
import type { ClsDriverOption } from "@/lib/cls-drivers";
import type { ClsCarOption } from "@/lib/cls-tracks-cars";
import {
  aggregateGarage61Laps,
  type G61ImportResult,
  type G61LapRow,
} from "@/lib/garage61-import";
import {
  autofillDrivers,
  isNightStint,
  type AutofillResult,
  type AutofillStint,
  type BrokenWish,
  type StintPref,
  type StintPref3,
} from "@/lib/stint-autofill";
import {
  addSource,
  makeSource,
  poolLapCount,
  poolRows,
  sourceSummary,
  MAX_POOL_LAPS,
} from "@/lib/garage61-pool";
import { pullGarage61Laps } from "@/lib/actions/garage61-pull";
import StintDriverStats from "@/components/StintDriverStats";
import RaceLogDashboard from "@/components/RaceLogDashboard";
import RaceGallery from "@/components/RaceGallery";
import { uploadStintPlanImages } from "@/lib/actions/stint-plan-images";
import { matchPitReference, type PitReferenceRow } from "@/lib/pit-references";
import {
  suggestPaceReference,
  type PaceReferenceRow,
} from "@/lib/pace-references";
import { fmtPaceSec, parseLapInput, targetLapSec } from "@/lib/pace-reference";
import {
  scanPitStops,
  derivePitConstants,
  pitRowsFromSheet,
  type PitLapRow,
  type PitStopScan,
  type StopKind,
} from "@/lib/garage61-pitstops";
import { upsertPitReference } from "@/lib/actions/pit-references";
import { checkStintPlanAlerts } from "@/lib/actions/stint-plan-alerts";
import {
  connectGarage61,
  setGarage61Team,
  disconnectGarage61,
  getGarage61Status,
  type G61TeamOption,
  type G61Status,
} from "@/lib/actions/garage61-connect";
import { usePlannerUi, useT } from "@/components/planner/PlannerUi";
import { ClsDriverPicker } from "@/components/planner/ClsDriverPicker";
import { Field, CheckField, Hint } from "@/components/planner/Field";
import PlannerUiSwitch from "@/components/planner/PlannerUiSwitch";
import AdvancedOnly from "@/components/planner/AdvancedOnly";
import GuideLink from "@/components/planner/GuideLink";
import PlanChecklist, { type ChecklistItem } from "@/components/planner/PlanChecklist";
import PlanWarnings from "@/components/planner/PlanWarnings";
import type { PlannerDict } from "@/lib/i18n/planner";

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

/**
 * The three lives of a stint plan: building it, running it, picking it apart.
 * Still the unit the race clock reasons about — see `autoPhase`.
 */
type PlanPhase = "pre" | "during" | "post";

/**
 * The tabs on screen.
 *
 * Building a plan is two jobs, not one long scroll: settle what the race is,
 * then feed it numbers. Johann Solowej's proposal (Sept 2026) drew them as
 * separate pages and he was right about the split; the first cut made it three
 * pages, which was one too many — "what the TEAM runs" and "what each DRIVER
 * runs" are the same sitting of the same work, and splitting them meant
 * jumping tabs to compare a profile with the driver figures it falls back to.
 * So PRE is two tabs:
 *
 *   basis — what the race is, what a stop costs, who is in the car
 *   prep  — the numbers: profiles, fuel-save targets, imported figures, the
 *           driver table, availability
 *
 * Labels come from the dictionary; this only fixes the order and which phase
 * each tab belongs to.
 */
type PlanTab = "basis" | "prep" | "during" | "post";
const TABS: {
  key: PlanTab;
  phase: PlanPhase;
  labelKey: "basis" | "prep" | "during" | "post";
}[] = [
  { key: "basis", phase: "pre", labelKey: "basis" },
  { key: "prep", phase: "pre", labelKey: "prep" },
  { key: "during", phase: "during", labelKey: "during" },
  { key: "post", phase: "post", labelKey: "post" },
];
/** Where the race clock sends you when you have not picked a tab yourself. */
const DEFAULT_TAB: Record<PlanPhase, PlanTab> = {
  pre: "basis",
  during: "during",
  post: "post",
};

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

/**
 * Write out what a stop is made of, honouring how the service actually runs.
 * With parallel service the tyre change hides under the refuelling, so listing
 * "+ 20 tyres" makes the parts look like they should sum to the total when they
 * do not — say "overlapped" instead.
 */
function stopBreakdownText(
  b: PitStopBreakdown,
  m: PitModel,
  t: PlannerDict
): string {
  const parts = [`${b.laneSec.toFixed(0)}s ${t.breakdown.lane}`];
  if (m.tyreSequential) {
    if (b.refuelSec > 0) parts.push(`${b.refuelSec.toFixed(1)}s ${t.breakdown.fuel}`);
    if (b.tyreSec > 0) parts.push(`${b.tyreSec.toFixed(0)}s ${t.breakdown.tyres}`);
  } else {
    // Parallel: only the longer of the two is on the clock.
    const tyresLonger = b.tyreSec > b.refuelSec;
    const longer = tyresLonger ? t.breakdown.tyres : t.breakdown.fuel;
    const shorter = tyresLonger ? t.breakdown.fuel : t.breakdown.tyres;
    const longerSec = Math.max(b.tyreSec, b.refuelSec);
    const shorterSec = Math.min(b.tyreSec, b.refuelSec);
    if (longerSec > 0) {
      parts.push(
        `${longerSec.toFixed(1)}s ${longer}` +
          (shorterSec > 0
            ? ` (${t.breakdown.overlapped(shorterSec.toFixed(0), shorter)})`
            : "")
      );
    }
  }
  if (b.swapExtraSec > 0)
    parts.push(`${b.swapExtraSec.toFixed(0)}s ${t.breakdown.driverChange}`);
  return parts.join(" + ");
}

// Shared input styling.
const inp =
  "w-full rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none";
const lbl = "block text-[11px] font-medium uppercase tracking-wider text-zinc-500";
const card = "rounded-lg border border-zinc-800 bg-zinc-900/40 p-4";

/**
 * One of the three free-text notes blocks (pre / during / post).
 *
 * TWO things the plain textarea got wrong.
 *
 * PRINTING: a textarea only ever prints what is scrolled into view — the rest
 * of the text is silently missing from the paper, which for a pit-wall note is
 * the worst possible failure. So the textarea is hidden in print and a plain
 * block carrying the SAME text is printed instead, wrapping over as many pages
 * as it needs.
 *
 * ROOM TO WRITE: h-32 is fine for a line or two and hopeless once a race is
 * running. The ⤢ button opens the field over the whole page; Escape or the
 * button closes it again. The plan underneath is untouched, and the same value
 * is edited either way — there is one piece of state, not two.
 */
function NotesField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  const [big, setBig] = useState(false);

  // Escape closes it. Bound only while open, so it cannot swallow Escape from
  // anything else on the page.
  useEffect(() => {
    if (!big) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBig(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [big]);

  const field = (cls: string, focus = false) => (
    <textarea
      className={`${inp} ${cls} resize-y`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={`${label}…`}
      disabled={disabled}
      autoFocus={focus}
    />
  );

  return (
    <div className={card}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className={lbl}>{label}</span>
        <button
          type="button"
          onClick={() => setBig(true)}
          className="rounded border border-zinc-700 px-2 py-0.5 text-[11px] text-zinc-400 hover:bg-zinc-800 print:hidden"
          title={t.notes.enlargeHint}
        >
          {t.notes.enlarge}
        </button>
      </div>

      <div className="print:hidden">{field("mt-1 h-32")}</div>

      {/* What actually reaches the paper. `whitespace-pre-wrap` keeps the
          line breaks the author typed; `break-words` stops a pasted URL from
          running off the sheet. Empty notes print nothing at all rather than
          an empty labelled box. */}
      {value.trim() !== "" && (
        <div className="hidden print:block">
          <p className="whitespace-pre-wrap break-words text-sm text-zinc-100">
            {value}
          </p>
        </div>
      )}

      {big && (
        <div
          className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 p-4 print:hidden sm:p-8"
          role="dialog"
          aria-label={label}
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="text-sm font-semibold uppercase tracking-wider text-orange-300">
              {label}
            </span>
            <button
              type="button"
              onClick={() => setBig(false)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-sm text-zinc-200 hover:bg-zinc-800"
            >
              {t.notes.doneEsc}
            </button>
          </div>
          {field("flex-1 min-h-0", true)}
          <p className="mt-2 text-[11px] text-zinc-500">{t.notes.savesAsYouType}</p>
        </div>
      )}
    </div>
  );
}

/** "Thomas Herbrig" → "TH". Keeps the spotter column from doubling the width
 *  of a table that already has to fit a whole race on one screen. */
const initialsOf = (name: string): string =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 3) || "?";

/** Why this stint's lap time is what it is — the tooltip on the Lap column. */
const lapBreakdownText = (
  t: PlannerDict,
  st: {
  lapSec: number;
  baseLapSec: number;
  tempDeltaSec: number;
  weatherDeltaSec: number;
  trafficDeltaSec: number;
  trackTempC: number | null;
  condition: string;
  driverName: string | null;
  paceFallback?: boolean;
  fuelFallback?: boolean;
    fuelPerLapUsed?: number;
  }
): string => {
  const who = st.driverName
    ? st.paceFallback
      ? t.lapBreak.driverFallback(st.driverName)
      : t.lapBreak.driver(st.driverName)
    : t.lapBreak.profilePace;
  const parts: string[] = [`${fmtLap(st.baseLapSec)} ${who}`];
  const add = (v: number, label: string) => {
    if (Math.abs(v) > 0.0005) parts.push(`${v > 0 ? "+" : "−"}${Math.abs(v).toFixed(2)} s ${label}`);
  };
  add(
    st.tempDeltaSec,
    st.trackTempC != null ? t.lapBreak.atTemp(st.trackTempC) : t.lapBreak.temperature
  );
  add(
    st.weatherDeltaSec,
    st.condition === "wet" ? t.lapBreak.fullWet : t.lapBreak.halfWet
  );
  add(st.trafficDeltaSec, t.lapBreak.traffic);
  const fuel =
    st.fuelPerLapUsed != null
      ? `\n${t.lapBreak.fuelLine(st.fuelPerLapUsed.toFixed(2))}${st.fuelFallback ? t.lapBreak.fuelFallback : ""}`
      : "";
  return `${parts.join("  ")}  ${t.lapBreak.perLap(fmtLap(st.lapSec))}${fuel}`;
};

// One stable colour per driver, the way Johann's sheet does it: the rotation is
// readable at a glance — a double stint is one colour twice, a swap is a change
// of colour — without reading a single name.
const DRIVER_COLOURS = [
  { chip: "bg-fuchsia-500/25 border-fuchsia-400/60 text-fuchsia-100", dot: "bg-fuchsia-400" },
  { chip: "bg-orange-500/25 border-orange-400/60 text-orange-100", dot: "bg-orange-400" },
  { chip: "bg-cyan-500/25 border-cyan-400/60 text-cyan-100", dot: "bg-cyan-400" },
  { chip: "bg-amber-400/25 border-amber-300/60 text-amber-100", dot: "bg-amber-300" },
  { chip: "bg-emerald-500/25 border-emerald-400/60 text-emerald-100", dot: "bg-emerald-400" },
  { chip: "bg-violet-500/25 border-violet-400/60 text-violet-100", dot: "bg-violet-400" },
  { chip: "bg-rose-500/25 border-rose-400/60 text-rose-100", dot: "bg-rose-400" },
  { chip: "bg-lime-500/25 border-lime-400/60 text-lime-100", dot: "bg-lime-400" },
  { chip: "bg-sky-500/25 border-sky-400/60 text-sky-100", dot: "bg-sky-400" },
  { chip: "bg-teal-500/25 border-teal-400/60 text-teal-100", dot: "bg-teal-400" },
];
const NO_DRIVER_COLOUR = {
  chip: "bg-zinc-800/60 border-zinc-700 text-zinc-400",
  dot: "bg-zinc-600",
};

const emptyStoreSubscribe = () => () => {};

type StintPlannerProps = {
  initial: PlannerState;
  planId?: string | null;
  initialUpdatedAtMs?: number | null;
  /** Set when the plan is marked completed — the plan half goes read-only. */
  initialArchivedAtMs?: number | null;
  viewerIsAdmin?: boolean;
  /** Creator or admin: may connect this plan's own Garage 61 token. Everyone
   *  else on the plan can edit it but not swap out somebody's credential. */
  viewerCanManage?: boolean;
  clsDrivers: ClsDriverOption[];
  tracks: string[];
  cars: ClsCarOption[];
  /** Measured pit constants per car/track (admin-curated shared library). */
  pitReferences?: PitReferenceRow[];
  /** iRating → lap time curves (admin-curated shared library). Only used by a
   *  plan set to "Official race" — see the Event card. */
  paceReferences?: PaceReferenceRow[];
};

export default function StintPlanner({
  initial,
  planId = null,
  initialUpdatedAtMs = null,
  initialArchivedAtMs = null,
  viewerIsAdmin = false,
  viewerCanManage = false,
  clsDrivers,
  tracks,
  cars,
  pitReferences = [],
  paceReferences = [],
}: StintPlannerProps) {
  const {
    t,
    advanced,
    g61Collapsed,
    setG61Collapsed,
    pitCollapsed,
    setPitCollapsed,
  } = usePlannerUi();
  const [s, setS] = useState<PlannerState>(initial);
  const [curId, setCurId] = useState<string | null>(planId);
  /** "Per driver" mode keeps the two profile rows collapsed — there they are
   *  only the fallback for a driver who carries no numbers of their own, and
   *  an open editor full of figures that mostly do not apply reads as if it
   *  did. Legacy ("Profile only") plans always show them: there they ARE the
   *  numbers. */
  const [showFuelProfiles, setShowFuelProfiles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // ---- Completed plans ---------------------------------------------------
  // "Completed" freezes the plan itself (event, drivers, stints, corrections,
  // Discord alerts) while the debrief — eventresult, race log, poster,
  // impressions, post-race notes — stays open. The server enforces this
  // (see stint-plans.ts); everything here is the matching UI.
  const [archivedAtMs, setArchivedAtMs] = useState<number | null>(initialArchivedAtMs);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const frozen = archivedAtMs !== null;

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
    const timer = setTimeout(() => {
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
    return () => clearTimeout(timer);
  }, [s, curId]);

  // Auto-refresh: poll for a newer server version and apply it — but only when
  // this client has no unsaved local edits (otherwise its own save wins).
  useEffect(() => {
    if (!curId) return;
    const iv = setInterval(() => {
      void (async () => {
        if (JSON.stringify(sRef.current) !== lastSavedSnapshotRef.current) return;
        const res = await getStintPlanLive(curId);
        // Someone else may have completed (or reopened) the plan meanwhile —
        // follow that here instead of letting this tab keep editing.
        if (res.ok) setArchivedAtMs(res.archivedAt);
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

  // The edit token, read live from local storage via useSyncExternalStore —
  // SSR-safe (no hydration mismatch) and it re-reads after we save a plan and
  // update curId. Since v2.2.0 it decides NOTHING: whether you may edit is the
  // server's access rule (creator / driver in the plan / added / admin), and
  // the page only renders for someone who passed it. The token is still sent
  // and stored so old links and old browser state keep working.
  const editToken = useSyncExternalStore(
    emptyStoreSubscribe,
    () => (curId ? window.localStorage.getItem(`stintplan:${curId}`) : null),
    () => null
  );

  const result = useMemo(() => buildSchedule(stateToInput(s)), [s]);
  /**
   * The fair-share floor: a quarter of an even share of the race.
   *
   * Not the same question as "is the workload balanced" — the drivers table
   * already flags anyone under 85 % of an even share for that. This is the
   * coarser one Johann Solowej asked for (Sept 2026): did this driver do
   * enough of the race to count as having driven it at all? A quarter of a
   * share is deliberately far below balanced, so it only fires on a seat that
   * is nearly empty rather than on a merely light stint load.
   *
   * Off entirely when the plan is not aiming for an even share.
   */
  const fairShareMin = useMemo(() => {
    if (s.event.fairShare === false) return null;
    const n = result.perDriver.length;
    if (n === 0 || result.totals.laps <= 0) return null;
    const even = result.totals.laps / n;
    return { min: Math.floor(even / 4), even: Math.round(even) };
  }, [s.event.fairShare, result.perDriver.length, result.totals.laps]);

  /** True when this plan prices its stops from measured constants. */
  const pitOn = planPitModel(s) !== null;
  /**
   * The schedule's detail columns — fill, tyres, stop cost, track temperature.
   *
   * They need a pit model to mean anything AND they are the columns Johann
   * Solowej asked to have out of the way in simple mode (Sept 2026). Unlike a
   * hidden card, these are dropped from the printout too: a pit-wall sheet in
   * Easy mode should be the short one, and the numbers behind them are not
   * being tracked by a team that chose Easy in the first place.
   */
  const showPitCols = pitOn && advanced;

  /**
   * Numbers that are legal but look wrong.
   *
   * The one that actually costs races is the lap time typed as "118.8" instead
   * of "1:58.8": the schedule that comes out is internally consistent, has
   * roughly twice the stints, and nothing on the page contradicts it. Every
   * check below is of that shape — plausible-looking input, silently wrong
   * output. None of them blocks anything.
   */
  const warnings = useMemo<string[]>(() => {
    const out: string[] = [];
    const e = s.event;
    const lapSec = parseDurationToSec(s.standard.laptime);
    const fuelPerLap = parseTypedNumber(s.standard.fuelPerLap);
    const tank = parseTypedNumber(e.tankSize);
    const reserve = parseTypedNumber(e.fuelReserve);

    // 25 s is quicker than any lap in iRacing that a stint plan is built for;
    // 12 min is longer than the Nordschleife at a crawl.
    if (lapSec != null && lapSec > 0 && lapSec < 25)
      out.push(t.warn.lapTimeShort(s.standard.laptime));
    if (lapSec != null && lapSec > 720)
      out.push(t.warn.lapTimeLong(s.standard.laptime));

    const usable = Math.max(0, tank - reserve);
    if (fuelPerLap > 0 && usable > 0) {
      const lapsPerTank = usable / fuelPerLap;
      // Under 3 laps a tank means one of the two numbers is in the wrong unit;
      // over 200 means the tank or the consumption is not this car's.
      if (lapsPerTank < 3 || lapsPerTank > 200)
        out.push(t.warn.fuelVsTank(fmtLaps(round1(lapsPerTank))));
    }
    if (tank > 0 && reserve > tank * 0.2) out.push(t.warn.reserveHigh);

    if (result.stints.length === 1 && result.raceSec > 3600)
      out.push(t.warn.stintOverRace);
    if (result.stints.length > 0 && result.totals.pitStops === 0 && result.raceSec > 5400)
      out.push(t.warn.noStops);

    const gridFuel = parseTypedNumber(e.gridFuelL);
    if (gridFuel > 0 && fuelPerLap > 0 && gridFuel > fuelPerLap)
      out.push(t.warn.gridFuelHigh);

    const short = result.stints.filter((st) => st.fuelShort).length;
    if (short > 0) out.push(t.warn.fuelShortStints(short));

    // A track temperature with no slope behind it changes nothing at all, and
    // the field gives no sign of that.
    if (e.trackTempC.trim() !== "" && s.tempModel == null)
      out.push(t.warn.tempWithoutModel);

    return out;
  }, [s, result, t]);

  /**
   * The "what is still missing" list above the schedule. Only the inputs the
   * engine genuinely cannot do without are steps — a plan is usable long
   * before every field on the page is filled in, and a checklist that demands
   * the track temperature would be a lie about what is required.
   *
   * Session start is included even though the schedule computes without it:
   * without it there are no wall-clock times, no night stints and no Discord
   * alerts, which is most of what the plan is for on race day.
   */
  const checklist = useMemo<ChecklistItem[]>(() => {
    const has = (v: string | undefined | null) => (v ?? "").trim() !== "";
    const e = s.event;
    const items: ChecklistItem[] = [
      { key: "track", label: t.checklist.track, anchor: "card-event", done: has(e.track) },
      { key: "car", label: t.checklist.car, anchor: "card-event", done: has(e.car) },
      {
        key: "duration",
        label: t.checklist.duration,
        anchor: "card-event",
        done:
          e.raceLimit === "time"
            ? has(e.raceDuration)
            : e.raceLimit === "laps"
              ? has(e.raceLaps)
              : has(e.raceDistance),
      },
    ];
    // A lap count or a distance can only become a schedule once the planner
    // knows how long a lap is; a timed race never needs it.
    if (e.raceLimit === "distance") {
      items.push({
        key: "lapDistance",
        label: t.checklist.lapDistance,
        anchor: "card-event",
        done: has(e.lapDistanceKm),
      });
    }
    items.push(
      {
        key: "lapTime",
        label: t.checklist.lapTime,
        anchor: "card-fuel",
        done: has(s.standard.laptime),
      },
      {
        key: "fuelPerLap",
        label: t.checklist.fuelPerLap,
        anchor: "card-fuel",
        done: has(s.standard.fuelPerLap),
      },
      { key: "tank", label: t.checklist.tank, anchor: "card-event", done: has(e.tankSize) },
      {
        key: "drivers",
        label: t.checklist.drivers,
        anchor: "card-drivers",
        done: s.drivers.length > 0,
      },
      {
        key: "start",
        label: t.checklist.start,
        anchor: "card-event",
        done: has(e.sessionStartLocal),
      }
    );
    return items;
  }, [s, t]);
  /** An OFFICIAL race is measured against what each driver's iRating was worth,
   *  not against the fastest man in class — see the Event card. */
  const official = s.event.raceKind === "official";
  /** The pace curve this plan compares against, and the library's own
   *  suggestion for this track + car when nothing is chosen yet. */
  const paceCurve =
    paceReferences.find((r) => r.id === s.event.paceCurveId) ?? null;
  const paceSuggestion = suggestPaceReference(
    paceReferences,
    s.event.car,
    s.event.track
  );
  /** The typed 10k yardstick in seconds, or the curve's own value at 10k. */
  const refLapSec =
    parseLapInput(s.event.refLap) ??
    (paceCurve ? (targetLapSec(paceCurve.points, 10000)?.sec ?? null) : null);
  /** Lap target of a distance race (null = the race ends on the clock). */
  const lapTarget = planLapTarget(s);

  // Garage 61 figures for the driver table, keyed by normalised name.
  const normName = (n: string) => n.trim().toLowerCase();
  /** "12 Jun" — enough to see at a glance how fresh the imported laps are. */
  const fmtDay = (ms: number) =>
    new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(ms));
  // ---- Driver performance table -------------------------------------------
  // Everything here is what the SCHEDULE uses, not raw practice data: the pace
  // is the plan's per-driver figure (Garage 61, projected to the plan's track
  // temperature) plus the race-traffic penalty, and the range per stint is that
  // pace against the driver's own fuel consumption. Weather is per stint, so
  // this table shows the dry baseline and names the penalties underneath.
  const driverPerf = useMemo(() => {
    const inp = stateToInput(s);
    const usable = Math.max(0, inp.tankSize - (inp.fuelReserve ?? 0));
    const traffic = inp.trafficPenaltySec ?? 0;
    const byId = new Map(result.perDriver.map((d) => [d.driverId, d]));
    const rows = s.drivers.map((d) => {
      const eng = inp.drivers.find((x) => x.id === d.id);
      const paceSec = eng?.laptimeSec && eng.laptimeSec > 0 ? eng.laptimeSec : inp.standard.laptimeSec;
      const fuelPerLap =
        eng?.fuelPerLap && eng.fuelPerLap > 0 ? eng.fuelPerLap : inp.standard.fuelPerLap;
      const wear =
        eng?.tyreWearPctPerLap != null && eng.tyreWearPctPerLap >= 0
          ? eng.tyreWearPctPerLap
          : (inp.tyreWearPctPerLap ?? 0);
      const effPace = paceSec > 0 ? paceSec + traffic : 0;
      const lapsPerStint = fuelPerLap > 0 ? Math.floor(usable / fuelPerLap) : 0;
      const totals = byId.get(d.id);
      return {
        id: d.id,
        name: d.name,
        paceSec,
        effPace,
        fuelPerLap,
        wear,
        lapsPerStint,
        rangeSec: lapsPerStint * effPace,
        laps: totals?.laps ?? 0,
        stints: totals?.stints ?? 0,
      };
    });
    // Team average, weighted by laps actually driven (an unassigned driver must
    // not drag the average around) — falls back to a plain mean before the
    // schedule is filled.
    const wsum = rows.reduce((a, r) => a + (r.laps || 0), 0);
    const w = (get: (r: (typeof rows)[number]) => number) => {
      if (rows.length === 0) return 0;
      if (wsum > 0) return rows.reduce((a, r) => a + get(r) * r.laps, 0) / wsum;
      return rows.reduce((a, r) => a + get(r), 0) / rows.length;
    };
    const avg = {
      paceSec: w((r) => r.paceSec),
      effPace: w((r) => r.effPace),
      fuelPerLap: w((r) => r.fuelPerLap),
      wear: w((r) => r.wear),
      laps: rows.reduce((a, r) => a + r.laps, 0),
      stints: rows.reduce((a, r) => a + r.stints, 0),
    };
    // An even share of the distance — the yardstick for "has everyone had a go".
    const evenShare = rows.length > 0 ? Math.round(result.totals.laps / rows.length) : 0;
    return { rows, avg, evenShare, traffic };
  }, [s, result]);

  // Track temperature of the whole import — the fallback for plans whose stored
  // analysis predates the per-driver figure, and the source of the temp fit.
  const analysisTemp = s.g61Analysis?.temp ?? null;
  const g61ByDriver = useMemo(() => {
    const m = new Map<string, NonNullable<typeof s.g61Analysis>["drivers"][number]>();
    for (const d of s.g61Analysis?.drivers ?? []) m.set(normName(d.driver), d);
    return m;
  }, [s.g61Analysis]);

  // ---- Race start ---------------------------------------------------------
  // One rule since v2.19.0: the stored race start IS the green flag, and "Now"
  // stamps this second. There used to be an offset field on top of it, and it
  // earned its removal — on race day nobody types m:ss into a field, somebody
  // watches the flag and hits the button. Plans saved under the old meaning had
  // their offset folded into the start on load (see hydratePlanState).
  const setRaceStartNow = () => {
    const green = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const local =
      `${green.getFullYear()}-${pad(green.getMonth() + 1)}-${pad(green.getDate())}` +
      `T${pad(green.getHours())}:${pad(green.getMinutes())}:${pad(green.getSeconds())}`;
    patchEvent("sessionStartLocal", local);
    setStatus(t.msg.raceStartStamped);
  };

  // The shared library entry that fits this plan's car (+ track, when measured
  // there). Loading it fills the pit model in one click — nobody re-measures
  // what someone else already drove.
  const pitRef = useMemo(
    () => matchPitReference(pitReferences, s.event.car, s.event.track),
    [pitReferences, s.event.car, s.event.track]
  );
  const applyPitReference = (r: PitReferenceRow) =>
    setS((p) => ({
      ...p,
      event: {
        ...p.event,
        pitModelOn: true,
        pitLaneLossSec: String(r.laneLossSec),
        refuelLps: String(r.refuelLps),
        tyreChangeSec: String(r.tyreChangeSec),
        driverSwapSec: String(r.driverChangeSec),
        tyreSequential: r.tyreSequential,
        tyreWearPctPerLap:
          r.tyreWearPctPerLap != null ? String(r.tyreWearPctPerLap) : p.event.tyreWearPctPerLap,
        tankSize: r.tankSizeL != null ? String(r.tankSizeL) : p.event.tankSize,
      },
    }));
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
  // The event block holds strings and a few switches (pitModelOn,
  // tyreSequential), so the patcher takes either.
  const patchEvent = (k: keyof PlannerState["event"], v: string | boolean) =>
    setS((p) => ({ ...p, event: { ...p.event, [k]: v } }));
  const patchStd = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, standard: { ...p.standard, [k]: v } }));
  const patchSav = (k: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, saving: { ...p.saving, [k]: v } }));
  /** Whether this plan computes stints from each driver's own averages. Plans
   *  saved before the delta model open in the legacy mode and stay there until
   *  someone flips this switch. */
  const deltaSaving = isDeltaSaving(s);
  /** Show the Standard / Fuel-saving editors? Always in the legacy model,
   *  where they are the numbers; on request in "Per driver", where they are
   *  only the fallback. */
  const profilesOpen = !deltaSaving || showFuelProfiles;
  /** The plan-wide fuel-save effort — the gap between the two profiles. It is
   *  what a driver without their own delta columns gives up and saves. */
  const planDelta = savingDeltas(s);
  /** Per-driver fuel-save effort, typed by hand. Garage 61 cannot measure a
   *  lift-and-coast delta, so these columns are always the team's own. */
  const patchDriverSaving = (id: string, key: "savingSec" | "savingFuel", v: string) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => (d.id === id ? { ...d, [key]: v } : d)),
    }));

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
      drivers: p.drivers.map((d) =>
        d.id === id
          ? { ...d, laptime: v, manual: { ...(d.manual ?? {}), laptime: v.trim() !== "" } }
          : d
      ),
    }));
  /** Per-driver fuel consumption / tyre wear, typed by hand. */
  /**
   * Per-driver fields that only a human ever fills: the iRating and the
   * condition deltas. They deliberately do NOT set a `manual` flag — that flag
   * exists to stop a Garage 61 pull overwriting a hand-typed figure, and
   * nothing pulls these.
   */
  const patchRain = (key: "laptime" | "fuelPerLap", v: string) =>
    setS((p) => ({ ...p, rain: { ...(p.rain ?? { laptime: "", fuelPerLap: "" }), [key]: v } }));

  const patchDriverPlain = (
    id: string,
    key: "iRating" | "wetSec" | "halfWetSec" | "trafficSec" | "tempSlopePer10",
    v: string
  ) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => (d.id === id ? { ...d, [key]: v } : d)),
    }));

  const patchDriverField = (
    id: string,
    key: "fuelPerLap" | "tyreWear",
    v: string
  ) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) =>
        d.id === id
          ? { ...d, [key]: v, manual: { ...(d.manual ?? {}), [key]: v.trim() !== "" } }
          : d
      ),
    }));
  /** Drop a hand-typed figure so the next Garage 61 pull owns it again. */
  const resetDriverField = (
    id: string,
    key: "laptime" | "fuelPerLap" | "tyreWear"
  ) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) =>
        d.id === id ? { ...d, [key]: "", manual: { ...(d.manual ?? {}), [key]: false } } : d
      ),
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
  // In a distance race the race length is a projection, so the availability
  // grid has to follow the schedule instead of the (unused) duration field.
  const raceSecForAvail = result.raceSec || (parseDurationToSec(s.event.raceDuration) ?? 0);
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
  /** The browser's offset from UTC, read once. Race times are shown in this
   *  clock, so "night" has to be measured in it too. */
  const [tzOffsetMin] = useState(() => -new Date().getTimezoneOffset());
  /** Is this stint in the plan's night window? Only knowable with a race start. */
  const stintAtNight = (st: { wallStartMs: number | null }) =>
    isNightStint(
      { startSec: 0, endSec: 0, wallStartMs: st.wallStartMs, rain: false },
      {
        nightFromHour: parseTypedNumber(s.event.nightFromHour, 23),
        nightToHour: parseTypedNumber(s.event.nightToHour, 6),
        localOffsetMin: tzOffsetMin,
      }
    );

  /** Write one preference onto a driver row. */
  const patchDriverPref = (
    driverId: string,
    patch: Partial<
      Pick<
        PlannerState["drivers"][number],
        "prefNight" | "prefRain" | "prefStart" | "maxConsecutive"
      >
    >
  ) =>
    setS((p) => ({
      ...p,
      drivers: p.drivers.map((d) => (d.id === driverId ? { ...d, ...patch } : d)),
    }));

  /** The three-way wish selector. "—" is a real answer: most drivers do not
   *  care, and a plan that pretends otherwise pushes the fill around for
   *  nothing. */
  const prefSelect = (
    driverId: string,
    key: "prefNight" | "prefRain" | "prefStart",
    value: StintPref | undefined,
    what: string
  ) => (
    <select
      value={value ?? ""}
      onChange={(e) => patchDriverPref(driverId, { [key]: e.target.value as StintPref })}
      title={t.avail.prefHint(what)}
      className={`rounded border bg-zinc-950 px-1.5 py-1 text-xs ${
        value === "prefer"
          ? "border-emerald-700/70 text-emerald-200"
          : value === "avoid"
            ? "border-amber-700/70 text-amber-200"
            : "border-zinc-700 text-zinc-400"
      }`}
    >
      <option value="">—</option>
      <option value="prefer">{t.avail.prefHappy}</option>
      <option value="avoid">{t.avail.prefAvoid}</option>
    </select>
  );

  /** One broken preference, phrased in the interface language. */
  const brokenWishText = (w: BrokenWish): string => {
    switch (w.kind) {
      case "nightStints":
        return t.wish.nightStints(w.n ?? 0);
      case "noNightStint":
        return t.wish.noNightStint;
      case "wetStints":
        return t.wish.wetStints(w.n ?? 0);
      case "noWetStint":
        return t.wish.noWetStint;
      case "takesStart":
        return t.wish.takesStart;
      case "notOnStart":
        return t.wish.notOnStart;
      case "runTooLong":
        return t.wish.runTooLong(w.n ?? 0);
      case "doubleAgainstWish":
        return t.wish.doubleAgainstWish;
      case "tripleAgainstWish":
        return t.wish.tripleAgainstWish;
      case "outsideAvailability":
        return t.wish.outsideAvailability(w.n ?? 0);
    }
  };

  /**
   * The three-state preference picker for a run of stints.
   *
   * The two-state one says yes or no and has no room for the answer most
   * drivers actually give about a double stint — "fine, if that is what the
   * plan needs". Johann Solowej asked for the third state (Sept 2026).
   */
  /** The old single limit is only worth a column on a plan that actually uses
   *  one — on a new plan the Double/Triple pair says the same thing better. */
  const showLegacyMaxRow = s.drivers.some((d) => (d.maxConsecutive ?? "").trim() !== "");

  const runPrefSelect = (
    driverId: string,
    key: "prefDouble" | "prefTriple",
    value: StintPref3 | undefined,
    hint: string
  ) => (
    <select
      value={value ?? ""}
      onChange={(e) =>
        patchDriverPref(driverId, { [key]: e.target.value as StintPref3 })
      }
      title={hint}
      className={`rounded border bg-zinc-950 px-1.5 py-1 text-xs ${
        value === "happy"
          ? "border-emerald-700/70 text-emerald-200"
          : value === "avoid"
            ? "border-amber-700/70 text-amber-200"
            : value === "ok"
              ? "border-zinc-600 text-zinc-200"
              : "border-zinc-700 text-zinc-400"
      }`}
    >
      <option value="">—</option>
      <option value="happy">{t.jo.prefHappy}</option>
      <option value="ok">{t.jo.prefOk}</option>
      <option value="avoid">{t.jo.prefAvoid}</option>
    </select>
  );

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
  const setAssignment = (i: number, patch: Partial<PlannerAssignmentState>) => {
    // A hand-picked seat makes the automatic line-up's report stale: it would
    // still be claiming preferences are met for a plan that has moved on.
    if ("driverId" in patch) setFillReport(null);
    setS((p) => {
      const next = [...p.assignments];
      while (next.length <= i)
        next.push({ profile: "standard", driverId: null });
      next[i] = { ...next[i], ...patch };
      return { ...p, assignments: next };
    });
  };

  // Fill drivers across the stints. `double` = double-stint pairs (each driver
  // does 2 consecutive stints, so every other stop is refuel-only); otherwise
  // single-stint round-robin. Preserves each stint's other fields (wet, note…).
  const fillDrivers = (
    p: PlannerState
  ): { state: PlannerState; report: AutofillResult | null } => {
    if (p.drivers.length === 0) return { state: p, report: null };
    const n = Math.max(result.stints.length, p.assignments.length);
    // The schedule is the truth about when a stint runs; assignments past its
    // end (a plan that lost stints) fall back to the last stint's window so the
    // fill still has something to reason about.
    const last = result.stints[result.stints.length - 1];
    const stints: AutofillStint[] = Array.from({ length: n }, (_, i) => {
      const st = result.stints[i] ?? last ?? null;
      const a = p.assignments[i];
      return {
        startSec: st?.startSec ?? i * 3600,
        endSec: st?.endSec ?? (i + 1) * 3600,
        wallStartMs: st?.wallStartMs ?? null,
        rain: st ? st.condition !== "dry" : conditionOf(a ?? {}) !== "dry",
      };
    });
    const out = autofillDrivers(
      stints,
      p.drivers.map((d) => ({
        id: d.id,
        name: d.name,
        blockedHours: p.availability[d.id] ?? [],
        night: d.prefNight ?? "",
        rain: d.prefRain ?? "",
        start: d.prefStart ?? "",
        maxConsecutive: parseTypedNumber(d.maxConsecutive, 0),
        double: d.prefDouble ?? "",
        triple: d.prefTriple ?? "",
      })),
      {
        nightFromHour: parseTypedNumber(p.event.nightFromHour, 23),
        nightToHour: parseTypedNumber(p.event.nightToHour, 6),
        // The plan's times are shown in the browser's zone, so "night" is
        // measured in the same clock the team reads off the screen.
        localOffsetMin: tzOffsetMin,
      }
    );
    const next: PlannerAssignmentState[] = [];
    for (let i = 0; i < n; i++) {
      next.push({
        ...(p.assignments[i] ?? { profile: "standard", driverId: null }),
        profile: p.assignments[i]?.profile ?? "standard",
        driverId: out.assignment[i] ?? p.assignments[i]?.driverId ?? null,
        correctionMin: p.assignments[i]?.correctionMin ?? 0,
      });
    }
    return { state: { ...p, assignments: next }, report: out };
  };
  /** What the last automatic line-up had to compromise. Cleared as soon as a
   *  seat is picked by hand — by then it describes a plan that no longer is. */
  const [fillReport, setFillReport] = useState<AutofillResult | null>(null);
  const autoFill = () => {
    const { state, report } = fillDrivers(s);
    setFillReport(report);
    setS(state);
  };
  const clearAssignments = () => {
    setFillReport(null);
    setS((p) => ({ ...p, assignments: [] }));
  };

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
      setStatus(t.msg.resultParsed(res.summary.length, res.teamEvent));
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setResultError(t.msg.staleReloadUpload);
      } else {
        setResultError(t.msg.uploadFailed);
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
          ? t.msg.logParsed(res.ownCarNumber)
          : t.msg.logParsedNoCar
      );
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setLogError(t.msg.staleReloadUpload);
      } else {
        setLogError(t.msg.uploadFailed);
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
      setStatus(t.msg.logReanalysed);
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setLogError(t.msg.staleReloadRetry);
      } else {
        setLogError(t.msg.reanalyseFailed);
      }
    } finally {
      setUploadingLog(false);
    }
  }

  /** An older parse that predates lap timestamps: the plan's driver order
   *  cannot be applied to it until the archived file is read again. */
  const raceLogNoTimestamps =
    s.raceLog != null &&
    s.raceLog.stints.length > 0 &&
    !s.raceLog.stints.some((st) => st.startSec != null);
  /** A parse from before the average learned to drop the formation and start
   *  laps, the caution laps and the restart lap. The archived .jsonl still has
   *  the flag events, so one click brings the whole analysis up to date. */
  const raceLogOldExclusions =
    s.raceLog != null && (s.raceLog.exclV ?? 1) < 2;
  const raceLogNeedsReparse = raceLogNoTimestamps || raceLogOldExclusions;

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
    setStatus(t.msg.logPaceApplied);
  };

  const applyLogTrackTemp = () => {
    const logTemp = s.raceLog?.trackTempC;
    if (logTemp == null) return;
    setS((p) => ({ ...p, event: { ...p.event, trackTempC: String(logTemp) } }));
    setStatus(`Track temperature set to ${t} °C from the race log.`);
  };

  /**
   * "What would I have to save to get one more lap out of the tank?"
   *
   * The question a pit wall asks, answered directly instead of by sweeping the
   * whole fuel band. It reads the consumption the schedule is ACTUALLY running
   * on — the team average when the drivers carry their own figures — so the
   * "now" row matches the plan above rather than a profile nobody uses.
   */
  const fsTargets = useMemo(() => {
    const own = s.drivers
      .map((d) => parseTypedNumber(d.fuelPerLap ?? ""))
      .filter((v) => v > 0);
    const teamAvg = own.length
      ? own.reduce((a, b) => a + b, 0) / own.length
      : 0;
    const current = teamAvg > 0 ? teamAvg : parseTypedNumber(s.standard.fuelPerLap);
    return fuelSaveTargets({
      tankSize: parseTypedNumber(s.event.tankSize),
      fuelReserve: parseTypedNumber(s.event.fuelReserve),
      fuelPerLap: current,
      totalLaps: result.totals.laps,
      floorFuelPerLap: s.savingEnabled
        ? parseTypedNumber(s.saving.fuelPerLap)
        : 0,
      marginLap: s.event.marginLap === true,
    });
  }, [s, result.totals.laps]);

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
        fuelPerLap: parseTypedNumber(s.saving.fuelPerLap),
      },
      paceScale,
      // With the model, each strategy's stop is priced from the litres that
      // strategy actually takes — saving fuel shortens the stops too.
      pitModel: inp.pitModel ?? null,
      // A distance race flips the objective: cover the laps in the least time.
      raceLaps: inp.raceLaps ?? null,
      // Race pace, not practice pace.
      trafficPenaltySec: inp.trafficPenaltySec ?? 0,
    });
    setFuelSaveOpt(opt);
    // NOTHING is applied. This used to write the winning strategy straight
    // into the Standard profile, which meant a measured lap time and a measured
    // consumption were silently replaced by a computed target — and the target
    // was some consumption between the two profiles that no driver can aim at.
    // Johann Solowej asked for the opposite (Sept 2026) and he is right: show
    // what a longer stint would cost, leave the plan's own numbers alone.
    setFuelSaveMsg(null);
  };

  // ---- Garage 61 session import (client-side .xlsx parse) ----
  const [g61, setG61] = useState<G61ImportResult | null>(null);
  // Pit stops found in an uploaded session export, plus what the user says
  // happened at each one (the data cannot know whether tyres went on).
  const [pitScan, setPitScan] = useState<PitStopScan | null>(null);
  const [pitKinds, setPitKinds] = useState<StopKind[]>([]);
  const [pitSaveMsg, setPitSaveMsg] = useState<string | null>(null);
  // The spotter column is the widest thing in the schedule that nobody reads
  // twice, so it is off until asked for. Everything else stays visible.
  const [showSpotter, setShowSpotter] = useState(false);
  // Clearing the import is a two-click action: the analysis is cheap to re-pull,
  // but the pace and fuel it wrote into the driver table are the plan's numbers
  // by then, so wiping those is opt-in inside the confirmation.
  const [clearArmed, setClearArmed] = useState(false);
  const [clearDriverFigures, setClearDriverFigures] = useState(false);
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
      // The same export also carries what a pit stop cost: the sector columns
      // and "Fuel added". The API strips in/out laps, this file keeps them.
      const pitRows: PitLapRow[] = [];
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
        // Pit rows come from the same grid, via the shared (tested) mapper.
        pitRows.push(...pitRowsFromSheet(grid as unknown[][]));
      }
      if (rows.length === 0) {
        setG61Msg(t.msg.g61NoLapData);
        return;
      }
      // Cumulative: this file's laps are added to the ones the plan already
      // holds and everything is re-aggregated over the union. Off, it is the
      // old behaviour — this import is the whole truth.
      const cumulative = s.g61Cumulative === true;
      const added = makeSource({
        id: uid(),
        kind: "upload",
        label:
          Array.from(fileList)
            .map((f) => f.name)
            .join(", ") || "session export",
        importedAt: new Date().toISOString(),
        rows,
      });
      const pool = addSource(s.g61Sources ?? [], added, cumulative);
      const allRows = cumulative ? poolRows(pool.sources) : rows;
      const result = aggregateGarage61Laps(allRows, {
        rosterNames: s.drivers.map((d) => d.name),
      });
      if (result.drivers.length === 0) {
        const seen = result.diag?.driverNames ?? [];
        const matched = result.diag?.lapsAfterRoster ?? 0;
        setG61Msg(
          s.drivers.length > 0 && matched === 0
            ? t.msg.g61NoMatch(
                rows.length,
                seen.length ? seen.join(", ") : t.msg.g61NoDriverName
              )
            : t.msg.g61NoCleanLap(rows.length)
        );
        return;
      }
      setG61(result);
      setS((p) => ({
        ...p,
        g61Sources: pool.sources,
        g61Analysis: {
          ...result,
          generatedAt: new Date().toISOString(),
          source: {
            kind: "upload",
            window: cumulative
              ? `${pool.sources.length} imports · ${poolLapCount(pool.sources)} laps`
              : "session export",
          },
        },
      }));
      if (cumulative) {
        setG61Msg(
          t.msg.g61Added(rows.length, poolLapCount(pool.sources), pool.sources.length) +
            (pool.replacedDuplicate ? t.msg.g61Duplicate : "") +
            (pool.evicted.length
              ? t.msg.g61Evicted(pool.evicted.length, MAX_POOL_LAPS, pool.evicted.join(", "))
              : "") +
            t.msgPull.reviewThenApplySpaced
        );
      }
      // Did this session contain pit stops? Then the constants are in there too.
      const scan = scanPitStops(pitRows);
      // Keep a failed scan too — its error says which stop is missing, which is
      // more use than the panel silently not appearing.
      setPitScan(scan);
      setPitKinds(scan.ok ? scan.stops.map((x) => x.kind) : []);
    } catch {
      setG61Msg(t.msg.g61FileRead);
    } finally {
      setG61Busy(false);
    }
  }
  /** The stops from the upload, with whatever the user has labelled them. */
  const labelledStops = () =>
    (pitScan?.stops ?? []).map((st, i) => ({ ...st, kind: pitKinds[i] ?? st.kind }));

  /** Write the derived constants into this plan's pit model. */
  function applyDerivedPit() {
    const c = derivePitConstants(labelledStops());
    setS((p) => ({
      ...p,
      event: {
        ...p.event,
        pitModelOn: true,
        pitLaneLossSec: c.laneLossSec != null ? c.laneLossSec.toFixed(1) : p.event.pitLaneLossSec,
        refuelLps: c.refuelLps != null ? c.refuelLps.toFixed(2) : p.event.refuelLps,
        tyreChangeSec: c.tyreChangeSec != null ? c.tyreChangeSec.toFixed(1) : p.event.tyreChangeSec,
        tyreSequential: c.tyreSequential ?? p.event.tyreSequential,
      },
    }));
    setPitSaveMsg(t.msg.pitApplied);
  }

  /** Admins can put them in the shared library for this car + track. */
  async function saveDerivedPitToLibrary() {
    const c = derivePitConstants(labelledStops());
    if (c.laneLossSec == null || c.refuelLps == null || c.tyreChangeSec == null) {
      setPitSaveMsg(t.msg.pitLibraryIncomplete);
      return;
    }
    const res = await upsertPitReference({
      car: s.event.car,
      track: s.event.track,
      laneLossSec: Number(c.laneLossSec.toFixed(1)),
      refuelLps: Number(c.refuelLps.toFixed(2)),
      tyreChangeSec: Number(c.tyreChangeSec.toFixed(1)),
      driverChangeSec: parseTypedNumber(s.event.driverSwapSec, 30),
      tyreSequential: c.tyreSequential ?? true,
      tankSizeL: parseTypedNumber(s.event.tankSize) || null,
      source: `Measured from a Garage 61 session export, ${new Date().toLocaleDateString("en-GB")}`,
      notes: c.notes.join(" "),
    });
    setPitSaveMsg(
      res.ok ? t.msg.pitLibrarySaved(s.event.car, s.event.track) : res.error
    );
  }

  /** Seconds/lap the imported pace shifts by when projected to the plan's own
   *  track temperature. Used by both the preview and Apply, so the number the
   *  team reviews is the number that lands in the plan. */
  function g61Projection(a: NonNullable<typeof g61>): number {
    const srcTemp = a.temp.sourceTempC;
    const slope =
      a.temp.slopePerC != null
        ? a.temp.slopePerC
        : (s.tempModel?.manualSlopePerC ?? DEFAULT_TEMP_SLOPE_PER_C);
    const raceTempNum = parseTypedNumber(s.event.trackTempC, NaN);
    const raceTemp =
      s.event.trackTempC.trim() !== "" && isFinite(raceTempNum) ? raceTempNum : null;
    const targetTemp = raceTemp ?? srcTemp;
    return srcTemp != null && targetTemp != null ? slope * (targetTemp - srcTemp) : 0;
  }

  /**
   * Write a Garage 61 analysis into the plan: Standard profile, per-driver pace
   * and fuel, the temperature fit and the wet delta.
   *
   * Takes the analysis as an argument rather than reading the `g61` state,
   * because a pull that was saved with the plan must stay applicable after a
   * reload — the fresh-pull state is gone by then, but `s.g61Analysis` is not,
   * and re-applying is exactly what you want after handing a field back with ↺
   * or after changing the plan's track temperature.
   */
  function applyGarage61(source?: G61ImportResult | null) {
    const analysis = source ?? g61 ?? s.g61Analysis;
    if (!analysis) return;
    const norm = (x: string) => x.trim().toLowerCase();
    const matched = analysis.drivers.filter((gd) =>
      s.drivers.some((d) => norm(d.name) === norm(gd.driver))
    ).length;

    // Temperature model: prefer a data-driven slope, else keep the manual one.
    const srcTemp = analysis.temp.sourceTempC;
    const dataSlope = analysis.temp.slopePerC;
    const manual = s.tempModel?.manualSlopePerC ?? DEFAULT_TEMP_SLOPE_PER_C;
    const slope = dataSlope != null ? dataSlope : manual;
    const fromData = dataSlope != null;
    // Project the (source-temp) pace to the race temp if one is set, else leave
    // it at the data's source temp.
    const raceTempNum = parseTypedNumber(s.event.trackTempC, NaN);
    const raceTemp =
      s.event.trackTempC.trim() !== "" && isFinite(raceTempNum)
        ? raceTempNum
        : null;
    const targetTemp = raceTemp ?? srcTemp;
    const proj =
      srcTemp != null && targetTemp != null ? slope * (targetTemp - srcTemp) : 0;

    // Wet-weather model from the rain laps (measured delta wins; else manual).
    const measuredWet =
      analysis.wet && analysis.wet.deltaSec != null && analysis.wet.deltaSec > 0
        ? analysis.wet.deltaSec
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
        laptime: fmtLap(analysis.overall.laptimeSec + proj),
        fuelPerLap: analysis.overall.fuelPerLap.toFixed(2),
      },
      drivers: p.drivers.map((d) => {
        const gd = analysis.drivers.find((x) => norm(x.driver) === norm(d.name));
        if (!gd) return d;
        // Fill what Garage 61 measured, but never overwrite a figure the team
        // typed in themselves — they know something the data doesn't.
        return {
          ...d,
          laptime: d.manual?.laptime ? d.laptime : fmtLap(gd.racePaceSec + proj),
          fuelPerLap: d.manual?.fuelPerLap ? d.fuelPerLap : gd.fuelPerLap.toFixed(2),
        };
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
        wetFuelPerLap: analysis.wet?.fuelPerLap ?? null,
        appliedDeltaSec: 0,
      },
      g61Analysis: {
        ...analysis,
        generatedAt: new Date().toISOString(),
        // Keep where the data came from — the pull already recorded it.
        source: p.g61Analysis?.source,
      },
    }));

    const tempNote =
      srcTemp != null
        ? fromData
          ? ` Temperature fit from data: ${slope.toFixed(3)} s/°C over ${analysis.temp.minTempC?.toFixed(0)}–${analysis.temp.maxTempC?.toFixed(0)}°C; pace set at ${targetTemp != null ? round1(targetTemp) : round1(srcTemp)}°C.`
          : ` Laps were all near ${round1(srcTemp)}°C (no spread to fit) — using the ${(slope * 10).toFixed(1)} s/10°C manual estimate.`
        : "";
    // The pull has landed in the driver table, so drop the pending change list.
    setG61(null);
    setG61Msg(t.msg.g61Applied(matched, tempNote));
  }

  /**
   * Drop one import from the lap pool and rebuild the analysis from what is
   * left. A session that turned out to be a wet run, or a test on the wrong
   * setup, should not have to be undone by clearing everything and importing
   * the good sessions again.
   */
  function removeG61Source(id: string) {
    setS((p) => {
      const sources = (p.g61Sources ?? []).filter((x) => x.id !== id);
      if (sources.length === 0) {
        setG61(null);
        setG61Msg(t.msg.g61SourceRemovedEmpty);
        return { ...p, g61Sources: [], g61Analysis: null };
      }
      const result = aggregateGarage61Laps(poolRows(sources), {
        rosterNames: p.drivers.map((d) => d.name),
      });
      setG61(result.drivers.length > 0 ? result : null);
      setG61Msg(
        result.drivers.length > 0
          ? t.msg.g61SourceRemoved(poolLapCount(sources), sources.length)
          : t.msg.g61SourceRemovedEmpty
      );
      return {
        ...p,
        g61Sources: sources,
        g61Analysis:
          result.drivers.length > 0
            ? {
                ...result,
                generatedAt: new Date().toISOString(),
                source: {
                  kind: sources[sources.length - 1].kind,
                  window: `${sources.length} import${sources.length === 1 ? "" : "s"} · ${poolLapCount(sources)} laps`,
                },
              }
            : null,
      };
    });
  }

  /**
   * Throw away everything that came from Garage 61 for this plan.
   *
   * Removes the stored analysis and the lap pool behind it (so the driver table
   * stops showing Garage 61 columns and the provenance line disappears) and
   * drops the data-derived temperature and wet coefficients back to their
   * manual values. Figures the team typed in are never touched; pace and fuel
   * that the import wrote into the driver rows only go when explicitly asked
   * for, because by then they are what the schedule is built on.
   */
  function clearGarage61(alsoDriverFigures: boolean) {
    setS((p) => ({
      ...p,
      g61Analysis: null,
      g61Sources: [],
      tempModel: p.tempModel
        ? {
            ...p.tempModel,
            slopePerC: p.tempModel.manualSlopePerC ?? DEFAULT_TEMP_SLOPE_PER_C,
            fromData: false,
          }
        : p.tempModel,
      wetModel: p.wetModel
        ? {
            ...p.wetModel,
            deltaSec: p.wetModel.manualDeltaSec ?? DEFAULT_WET_DELTA_SEC,
            fromData: false,
            wetFuelPerLap: null,
          }
        : p.wetModel,
      drivers: alsoDriverFigures
        ? p.drivers.map((d) => ({
            ...d,
            laptime: d.manual?.laptime ? d.laptime : "",
            fuelPerLap: d.manual?.fuelPerLap ? d.fuelPerLap : "",
          }))
        : p.drivers,
    }));
    setG61(null);
    setPitScan(null);
    setPitKinds([]);
    setClearArmed(false);
    setClearDriverFigures(false);
    setG61Msg(
      alsoDriverFigures ? t.msg.g61ClearedWithFigures : t.msg.g61Cleared
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

  /** Edit the half-wet (damp) penalty; empty hands it back to the default share. */
  function setHalfWetDelta(valStr: string) {
    const raw = valStr.trim();
    const v = parseTypedNumber(raw, NaN);
    setS((p) => {
      const wm = p.wetModel ?? emptyWet();
      return {
        ...p,
        wetModel: {
          ...wm,
          manualHalfDeltaSec: raw === "" || !isFinite(v) ? null : Math.max(0, v),
        },
      };
    });
  }

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
  function setRainFromStint(fromIndex: number, cond: StintCondition = "wet") {
    setS((p) => {
      const n = Math.max(result.stints.length, p.assignments.length);
      const next = [...p.assignments];
      while (next.length < n) next.push({ profile: "standard", driverId: null });
      for (let i = 0; i < next.length; i++)
        next[i] = {
          ...next[i],
          condition: i >= fromIndex ? cond : "dry",
          wet: i >= fromIndex && cond === "wet",
        };
      return { ...p, assignments: next };
    });
  }
  const clearWetStints = () =>
    setS((p) => ({
      ...p,
      assignments: p.assignments.map((a) => ({ ...a, condition: "dry" as const, wet: false })),
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
      setStatus(t.msg.tempRampNeedEnds);
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
        const stintTemp = Math.round(tempAt(i) * 10) / 10;
        next[i] = { ...(next[i] ?? { profile: "standard", driverId: null }), trackTempC: stintTemp };
      }
      return { ...p, assignments: next };
    });
    setStatus(
      hasPeak
        ? t.msg.tempRampedPeak(String(a), String(peak), peakIdx + 1, String(b), n)
        : t.msg.tempRamped(String(a), String(b), n)
    );
  };
  // ---- Race poster & impressions -----------------------------------------
  const [galleryBusy, setGalleryBusy] = useState(false);
  const [galleryError, setGalleryError] = useState<string | null>(null);
  async function uploadImages(files: FileList | null, kind: "poster" | "impression") {
    if (!files || files.length === 0) return;
    setGalleryBusy(true);
    setGalleryError(null);
    try {
      const fd = new FormData();
      fd.append("kind", kind);
      const room =
        kind === "poster"
          ? 1
          : Math.max(0, MAX_IMPRESSIONS - s.impressions.length);
      const list = Array.from(files).slice(0, room);
      if (list.length === 0) {
        setGalleryError(t.msg.galleryMax(MAX_IMPRESSIONS));
        return;
      }
      for (const f of list) fd.append("files", f);
      const res = await uploadStintPlanImages(fd);
      if (!res.ok) {
        setGalleryError(res.error);
        return;
      }
      setS((p) =>
        kind === "poster"
          ? { ...p, poster: res.images[0] ?? p.poster }
          : { ...p, impressions: [...p.impressions, ...res.images] }
      );
      if (res.skipped.length > 0) {
        setGalleryError(t.msg.gallerySkipped(res.skipped.join(", ")));
      } else {
        setStatus(
          kind === "poster"
            ? t.msg.posterSaved
            : t.msg.picturesAdded(res.images.length)
        );
      }
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setGalleryError(t.msg.staleReloadRetry);
      } else {
        setGalleryError(t.msg.uploadFailed);
      }
    } finally {
      setGalleryBusy(false);
    }
  }
  const setImageCaption = (url: string, caption: string) =>
    setS((p) => ({
      ...p,
      poster:
        p.poster && p.poster.url === url ? { ...p.poster, caption } : p.poster,
      impressions: p.impressions.map((im) =>
        im.url === url ? { ...im, caption } : im
      ),
    }));
  const removeImpression = (url: string) =>
    setS((p) => ({
      ...p,
      impressions: p.impressions.filter((im) => im.url !== url),
    }));

  const clearStintTemps = () =>
    setS((p) => ({
      ...p,
      assignments: p.assignments.map((a) => ({ ...a, trackTempC: null })),
    }));
  // ---- Garage 61 live pull (server-side API, uses the event Track + Car) ----
  async function onGarage61Pull() {
    if (!s.event.track.trim()) {
      setG61Msg(t.msg.g61NeedTrack);
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
        // Only recent data: old pace was set on a different BoP and tyre model.
        age: s.event.g61Age.trim() === "" ? null : Number(s.event.g61Age),
      });
      if (!res.ok) {
        setG61Msg(res.error);
        return;
      }
      // A pull feeds the same lap pool as an upload, so an API window that no
      // longer reaches an old test session can be topped up from its export.
      const cumulative = s.g61Cumulative === true;
      const added = makeSource({
        id: uid(),
        kind: "pull",
        label: `Garage 61 · ${res.meta.window}`,
        importedAt: new Date().toISOString(),
        rows: res.rows,
      });
      const pool = addSource(s.g61Sources ?? [], added, cumulative);
      const merged = cumulative
        ? aggregateGarage61Laps(poolRows(pool.sources), {
            rosterNames: s.drivers.map((d) => d.name),
          })
        : res.result;
      setG61(merged);
      // Store it on the plan immediately. The tables read the SAVED analysis,
      // so without this a pull vanished the moment you left the page and the
      // driver table kept showing whatever was applied weeks ago. "Apply to
      // plan" stays a separate, deliberate step — it overwrites the pace and
      // fuel figures the schedule runs on.
      setS((p) => ({
        ...p,
        g61Sources: pool.sources,
        g61Analysis: {
          ...merged,
          generatedAt: new Date().toISOString(),
          source: {
            kind: "pull",
            window: cumulative
              ? `${res.meta.window} + ${pool.sources.length - 1} earlier import${pool.sources.length === 2 ? "" : "s"}`
              : res.meta.window,
            lapsFetched: res.meta.lapsFetched,
            lapsTooOld: res.meta.lapsTooOld,
            oldestLapMs: res.meta.oldestLapMs,
            newestLapMs: res.meta.newestLapMs,
            trackMatched: res.meta.trackMatched,
            carMatched: res.meta.carMatched,
          },
        },
      }));
      setG61Msg(
        // Say which window the data came from and what it cost — a silent
        // filter is how you end up planning on three laps.
        t.msg.g61Pulled(
          res.meta.lapsFetched,
          `${res.meta.trackMatched ?? t.msg.g61PullTrackFallback}${res.meta.carMatched ? " · " + res.meta.carMatched : ""}`,
          res.meta.window
        ) +
        (res.meta.lapsTooOld > 0 ? t.msg.g61PulledTooOld(res.meta.lapsTooOld) : "") +
        (res.meta.oldestLapMs != null && res.meta.newestLapMs != null
          ? ` · ${fmtDay(res.meta.oldestLapMs)}–${fmtDay(res.meta.newestLapMs)}`
          : res.meta.datesMissing
            ? t.msgPull.noDates
            : "") +
        (cumulative
          ? t.msgPull.addedToPool(poolLapCount(pool.sources), pool.sources.length) +
            (pool.replacedDuplicate ? t.msgPull.replacedDuplicate : "") +
            (pool.evicted.length ? t.msgPull.dropped(pool.evicted.join(", ")) : "")
          : "") +
        t.msgPull.reviewThenApply
      );
    } catch {
      setG61Msg(t.msg.g61PullFailed);
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
    if (!curId) return;
    if (g61Token.trim().length < 8) {
      setG61ConnMsg(t.msg.g61NeedToken);
      return;
    }
    setG61ConnBusy(true);
    setG61ConnMsg(null);
    try {
      const res = await connectGarage61(curId, editToken ?? "", g61Token.trim());
      if (!res.ok) {
        setG61ConnMsg(res.error);
        return;
      }
      setG61Token("");
      setG61Teams(res.teams);
      const st = await getGarage61Status(curId);
      setG61Status(st);
      setG61ConnMsg(
        res.teams.length > 1 ? t.msg.g61ConnectedPickTeam : t.msg.g61ConnectedOk
      );
    } catch {
      setG61ConnMsg(t.msg.g61ConnectFailed);
    } finally {
      setG61ConnBusy(false);
    }
  }

  async function onG61PickTeam(slug: string) {
    if (!curId) return;
    const team = g61Teams.find((x) => x.slug === slug);
    setG61ConnBusy(true);
    try {
      await setGarage61Team(curId, editToken ?? "", slug, team?.name ?? "");
      const st = await getGarage61Status(curId);
      setG61Status(st);
    } finally {
      setG61ConnBusy(false);
    }
  }

  async function onG61Disconnect() {
    if (!curId) return;
    setG61ConnBusy(true);
    setG61ConnMsg(null);
    try {
      await disconnectGarage61(curId, editToken ?? "");
      setG61Teams([]);
      const st = await getGarage61Status(curId);
      setG61Status(st);
      setG61ConnMsg(t.msg.g61Disconnected);
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
        !forceNew && curId
          ? await updateStintPlan(curId, editToken ?? "", s.title, s)
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
        setStatus(t.msg.savedCopied);
      } catch {
        setStatus(t.msg.savedNoClipboard);
      }
    } catch (e) {
      if (isStaleActionError(e)) {
        setStaleBuild(true);
        setStatus(t.msg.staleReloadSave);
      } else {
        setStatus(t.msg.saveFailed);
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
  const [manualTab, setManualTab] = useState<PlanTab | null>(null);
  // A completed plan opens on the debrief — that is the only part still live.
  const tab: PlanTab = manualTab ?? DEFAULT_TAB[frozen ? "post" : autoPhase];
  const setTab = (x: PlanTab) => setManualTab(x);
  /** Which life the VISIBLE tab belongs to. */
  const phase: PlanPhase = TABS.find((x) => x.key === tab)?.phase ?? "pre";
  /** One tab's wrapper: on screen only when selected, always on paper. */
  const tabBox = (key: PlanTab) =>
    `space-y-6 ${tab === key ? "" : "hidden print:block"}`;

  /**
   * Which setup tab a card lives on. The checklist jumps between them, and a
   * card on a hidden tab cannot be scrolled to — so switch first, then scroll
   * once React has painted the tab.
   */
  const jumpToCard = (anchor: string) => {
    const CARD_TAB: Record<string, PlanTab> = {
      "card-event": "basis",
      "card-pit": "basis",
      "card-drivers": "basis",
      "card-fuel": "prep",
      "card-paceadj": "prep",
      "card-fuelsave": "prep",
      "card-g61": "prep",
    };
    const target = CARD_TAB[anchor];
    if (target && target !== tab) setTab(target);
    // One frame for the tab to be shown; the element has no box until then.
    requestAnimationFrame(() =>
      document
        .getElementById(anchor)
        ?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  };

  /**
   * Six numbers, on every setup tab.
   *
   * Splitting PRE into three pages costs the one thing the single long page
   * had for free: the schedule was always a scroll away, so you could see what
   * a number did. This is the cheap half of that feedback — stints, stops,
   * laps, fuel, drivers and the projected finish — repeated at the top of each
   * setup tab. Hidden on paper: the printout has the schedule itself.
   */
  const summaryStrip = (
    <div className="grid grid-cols-3 gap-2 print:hidden lg:grid-cols-6">
      <Stat label={t.live.stints} value={String(result.totals.stintCount)} />
      <Stat label={t.live.pitStops} value={String(result.totals.pitStops)} />
      <Stat label={t.live.totalLaps} value={fmtLaps(result.totals.laps)} />
      <Stat label={t.live.totalFuel} value={`${fmtFuel(result.totals.fuel)} L`} />
      <Stat label={t.live.drivers} value={String(result.totals.driverCount)} />
      <Stat
        label={t.live.projectedFinish}
        value={lastStint ? fmtDuration(lastStint.endSec) : "—"}
      />
    </div>
  );

  /** Mark completed / reopen. Owner (edit token) or admin — checked server-side. */
  const onToggleArchived = async () => {
    if (!curId) return;
    const next = !frozen;
    if (
      next &&
      !window.confirm(t.header.confirmArchive)
    ) {
      return;
    }
    setArchiveBusy(true);
    setStatus(null);
    try {
      const res = await setStintPlanArchived(curId, editToken, next);
      if (res.ok) {
        setArchivedAtMs(res.archivedAt);
        setManualTab(next ? "post" : null);
        setStatus(next ? t.header.archived : t.header.reopened);
      } else {
        setStatus(res.error);
      }
    } catch (e) {
      if (isStaleActionError(e)) setStaleBuild(true);
      else setStatus(t.common.serverUnreachable);
    } finally {
      setArchiveBusy(false);
    }
  };

  // ---- "You're up next" Discord DMs --------------------------------------
  // The plan already knows when every stint starts, corrections included. This
  // turns that into a nudge for the driver who is up next. All the deciding
  // happens server-side (see stint-plan-alerts.ts); this only asks, regularly,
  // whether anything is due — and merges the returned ledger back in so the
  // auto-save can't drop it.
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [alertBusy, setAlertBusy] = useState(false);
  const runAlertCheck = async (force = false) => {
    if (!curId) return;
    if (force) setAlertBusy(true);
    try {
      const res = await checkStintPlanAlerts(curId, force);
      if (!res.ok) {
        if (force) setAlertMsg(res.error);
        return;
      }
      setS((p) =>
        JSON.stringify(p.alertsSent) === JSON.stringify(res.alertsSent)
          ? p
          : { ...p, alertsSent: res.alertsSent }
      );
      if (res.messages.length > 0) setAlertMsg(res.messages.join(" "));
      else if (force) setAlertMsg(t.sched.nothingDue);
    } catch (e) {
      if (isStaleActionError(e)) setStaleBuild(true);
      else if (force) setAlertMsg(t.common.serverUnreachable);
    } finally {
      if (force) setAlertBusy(false);
    }
  };
  // Poll while the race is live. 45 s is well inside any sane lead time and
  // costs one tiny request per tab.
  useEffect(() => {
    if (!curId || !s.alertsEnabled || !raceLive || frozen) return;
    void runAlertCheck(false);
    const iv = setInterval(() => void runAlertCheck(false), 45_000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runAlertCheck
    // closes over state that changes every keystroke; re-arming the interval
    // on each of those would reset the timer forever.
  }, [curId, s.alertsEnabled, raceLive, frozen]);



  // The schedule is the plan. It is needed BEFORE the race (who drives what,
  // when the stops fall) as much as during it, so it is rendered in both
  // phases from one definition — never two copies to keep in step. Pre-race
  // drops the Note column: notes are written while the race runs.
  /** Colour for a driver, stable for the life of the plan (by roster order). */
  const driverColour = (id: string | null | undefined) => {
    if (!id) return NO_DRIVER_COLOUR;
    const idx = s.drivers.findIndex((d) => d.id === id);
    return idx < 0 ? NO_DRIVER_COLOUR : DRIVER_COLOURS[idx % DRIVER_COLOURS.length];
  };

  const scheduleCard = ({ showNote }: { showNote: boolean }) => (
      // Full-bleed: the page column is ~1150px, the schedule is a landscape
      // table. Breaking out of the column is the difference between reading it
      // and squinting at it. On paper the page itself is landscape instead.
      <div className="relative left-1/2 w-screen max-w-[100vw] -translate-x-1/2 px-4 sm:px-6 print:left-0 print:w-auto print:translate-x-0 print:px-0">
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.sched.title}
            <GuideLink section="stints" />
          </h2>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <button
              onClick={() => setShowSpotter((v) => !v)}
              className={`rounded border px-2 py-1 text-xs ${showSpotter ? "border-zinc-600 bg-zinc-800 text-zinc-200" : "border-zinc-700 bg-zinc-900 text-zinc-400 hover:bg-zinc-800"}`}
              title={t.sched.spotterToggleHint}
            >
              {showSpotter ? t.sched.hideSpotter : t.sched.showSpotter}
            </button>
            <div className="flex items-center gap-1 rounded border border-sky-900/50 bg-sky-950/20 px-2 py-1 text-xs text-sky-200">
              <span title={t.sched.rainFromHint}>{t.sched.rainFrom}</span>
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
                  if (isFinite(n) && n >= 1) setRainFromStint(n - 1, "half");
                }}
                className="rounded border border-sky-800 px-1.5 py-0.5 text-sky-200 hover:bg-sky-900/40"
                title={t.sched.halfWetBtnHint}
              >
                {t.sched.halfWetBtn}
              </button>
              <button
                onClick={() => {
                  const n = Number(rainFromStr);
                  if (isFinite(n) && n >= 1) setRainFromStint(n - 1, "wet");
                }}
                className="rounded bg-sky-800 px-1.5 py-0.5 text-white hover:bg-sky-700"
                title={t.sched.wetBtnHint}
              >
                {t.sched.wetBtn}
              </button>
              <button
                onClick={clearWetStints}
                className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
                title={t.sched.allDryHint}
              >
                {t.sched.allDry}
              </button>
            </div>
            <div className="flex items-center gap-1 rounded border border-amber-900/50 bg-amber-950/20 px-2 py-1 text-xs text-amber-200">
              <span title={t.sched.tempRampHint}>{t.sched.tempRamp}</span>
              <input
                type="number"
                step="0.5"
                value={tempRampFrom}
                onChange={(e) => setTempRampFrom(e.target.value)}
                placeholder={t.sched.tempStart}
                title={t.sched.tempStartHint}
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <span className="text-amber-300/70">↗</span>
              <input
                type="number"
                step="0.5"
                value={tempRampPeak}
                onChange={(e) => setTempRampPeak(e.target.value)}
                placeholder={t.sched.tempPeak}
                title={t.sched.tempPeakHint}
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <input
                type="number"
                min={1}
                value={tempRampPeakAt}
                onChange={(e) => setTempRampPeakAt(e.target.value)}
                placeholder={t.sched.tempPeakAt}
                title={t.sched.tempPeakAtHint}
                className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <span className="text-amber-300/70">↘</span>
              <input
                type="number"
                step="0.5"
                value={tempRampTo}
                onChange={(e) => setTempRampTo(e.target.value)}
                placeholder={t.sched.tempEnd}
                title={t.sched.tempEndHint}
                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <button
                onClick={applyTempRamp}
                className="rounded bg-amber-700 px-1.5 py-0.5 text-white hover:bg-amber-600"
              >
                {t.common.apply}
              </button>
              <button
                onClick={clearStintTemps}
                className="rounded px-1.5 py-0.5 text-zinc-400 hover:bg-zinc-800"
                title={t.sched.clearTempsHint}
              >
                {t.sched.clearTemps}
              </button>
            </div>
            <div
              className={`flex items-center gap-1 rounded border px-2 py-1 text-xs ${
                s.alertsEnabled
                  ? "border-indigo-700/60 bg-indigo-950/30 text-indigo-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
            >
              <label
                className="flex cursor-pointer items-center gap-1"
                title={t.sched.discordAlertHint}
              >
                <input
                  type="checkbox"
                  checked={s.alertsEnabled}
                  onChange={(e) =>
                    setS((p) => ({ ...p, alertsEnabled: e.target.checked }))
                  }
                />
                {t.sched.discordAlert}
              </label>
              <input
                type="number"
                min={1}
                max={120}
                value={s.event.alertLeadMin}
                onChange={(e) => patchEvent("alertLeadMin", e.target.value)}
                title={t.sched.alertLeadHint}
                className="w-12 rounded border border-zinc-700 bg-zinc-950 px-1 py-0.5 text-zinc-100"
              />
              <span>{t.sched.minBefore}</span>
              <button
                onClick={() => runAlertCheck(true)}
                disabled={alertBusy || !curId}
                className="rounded bg-indigo-800 px-1.5 py-0.5 text-white hover:bg-indigo-700 disabled:opacity-40"
                title={t.sched.testAlertHint}
              >
                {alertBusy ? t.sched.sendingAlert : t.sched.testAlert}
              </button>
            </div>
            <button onClick={autoFill} title={t.sched.autoFillHint}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {t.sched.autoFill}
            </button>
            <button onClick={clearAssignments} title={t.sched.clearAssignmentsHint}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {t.sched.clearAssignments}
            </button>
          </div>
        </div>
        {alertMsg && (
          <p className="mb-3 rounded border border-indigo-800/60 bg-indigo-950/30 px-3 py-2 text-xs text-indigo-200">
            {alertMsg}
          </p>
        )}
        {s.alertsEnabled && !curId && (
          <p className="mb-3 text-xs text-amber-300">{t.sched.saveFirstForAlerts}</p>
        )}
        {result.stints.length === 0 ? (
          <p className="text-sm text-zinc-500">{t.sched.emptyState}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="sticky left-0 z-20 bg-zinc-900 py-1 pr-2 print:static print:bg-transparent">
                    {t.sched.colNum}
                  </th>
                  <th className="sticky left-8 z-20 bg-zinc-900 py-1 pr-2 print:static print:bg-transparent">
                    {t.sched.colDriver}
                  </th>
                  {showSpotter && (
                    <th className="py-1 pr-2">
                      {t.sched.colSpotter}
                      <Hint text={t.sched.colSpotterHint} />
                    </th>
                  )}
                  {s.savingEnabled && (
                    <th className="py-1 pr-2">
                      {t.sched.colProfile}
                      <Hint text={t.sched.colProfileHint} />
                    </th>
                  )}
                  <th className="py-1 pr-2 text-right">{t.sched.colRaceStart}</th>
                  {showClock && (
                    <th className="py-1 pr-2 text-right">{t.sched.colClockIn}</th>
                  )}
                  <th className="py-1 pr-2 text-right">{t.sched.colRaceEnd}</th>
                  <th className="py-1 pr-2 text-right">
                    {t.sched.colCorrection}
                    <Hint text={t.sched.colCorrectionHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">{t.sched.colLength}</th>
                  <th className="py-1 pr-2 text-right">
                    {t.sched.colLap}
                    <Hint text={t.sched.colLapHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.sched.colLaps}
                    <Hint text={t.sched.colLapsHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">{t.sched.colFuel}</th>
                  <th className="py-1 pr-2 text-right">
                    {t.sched.colLeft}
                    <Hint text={t.sched.colLeftHint} />
                  </th>
                  {showPitCols && (
                    <>
                      <th className="py-1 pr-2 text-center">
                        {t.sched.colFull}
                        <Hint text={t.sched.colFullHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.sched.colFillL}
                        <Hint text={t.sched.colFillLHint} />
                      </th>
                      <th className="py-1 pr-2 text-center">
                        {t.sched.colTyres}
                        <Hint text={t.sched.colTyresHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.sched.colTyrePct}
                        <Hint text={t.sched.colTyrePctHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.sched.colStop}
                        <Hint text={t.sched.colStopHint} />
                      </th>
                    </>
                  )}
                  {advanced && (
                    <th className="py-1 pr-2 text-right">
                      {t.sched.colTemp}
                      <Hint text={t.sched.colTempHint} />
                    </th>
                  )}
                  <th className="py-1 pr-2 text-center">
                    {t.sched.colTrack}
                    <Hint text={t.sched.colTrackHint} />
                  </th>
                  {showNote && <th className="py-1 pr-2">{t.sched.colNote}</th>}
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
                    <tr key={i} className={`border-t border-zinc-800/60 text-zinc-200 ${i === currentIdx ? "bg-emerald-950/30 ring-1 ring-inset ring-emerald-600/50" : st.condition === "wet" ? "bg-sky-950/20" : st.condition === "half" ? "bg-sky-950/10" : st.correctionMin ? "bg-amber-950/20" : ""}`}>
                      <td className="sticky left-0 z-10 bg-zinc-900 py-1 pr-2 text-zinc-500 print:static print:bg-transparent">
                        {st.index}
                        {st.partial && (
                          <span className="ml-1 text-[10px] uppercase text-amber-400">
                            {t.sched.fin}
                          </span>
                        )}
                      </td>
                      <td className="sticky left-8 z-10 bg-zinc-900 py-1 pr-2 print:static print:hidden print:bg-transparent">
                        <select
                          className={`rounded border px-2 py-1 text-sm font-medium ${driverColour(a.driverId).chip}`}
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
                          <option value="">{t.common.unassigned}</option>
                          {driverOpts.map((d) => (
                            <option key={d.id} value={d.id}>{d.name}</option>
                          ))}
                        </select>
                      </td>
                      <td className="hidden py-1 pr-2 print:table-cell">
                        {st.driverName ?? "—"}
                      </td>
                      {showSpotter && (
                        <>
                          <td className="py-1 pr-2 print:hidden">
                            <select
                              className={`rounded border px-2 py-1 text-sm ${driverColour(a.spotterId).chip}`}
                              value={a.spotterId ?? ""}
                              onChange={(e) => setAssignment(i, { spotterId: e.target.value || null })}
                              title={
                                spotterName
                                  ? t.sched.spotterOf(spotterName)
                                  : t.sched.noSpotter
                              }
                            >
                              <option value="">—</option>
                              {spotterOpts.map((d) => (
                                <option key={d.id} value={d.id} title={d.name}>
                                  {initialsOf(d.name)}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="hidden py-1 pr-2 print:table-cell" title={spotterName ?? undefined}>
                            {spotterName ? initialsOf(spotterName) : "—"}
                          </td>
                        </>
                      )}
                      {s.savingEnabled && (
                        <td className="py-1 pr-2 print:hidden">
                          <select
                            className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                            value={a.profile}
                            onChange={(e) => setAssignment(i, { profile: e.target.value as StintProfileKey })}
                          >
                            <option value="standard">{t.sched.profileStd}</option>
                            <option value="saving">{t.sched.profileFs}</option>
                          </select>
                        </td>
                      )}
                      <td className="py-1 pr-2 text-right text-zinc-400">{fmtDuration(st.startSec)}</td>
                      {showClock && (
                        <td className="py-1 pr-2 text-right text-zinc-400">
                          {fmtClock(st.wallStartMs)}
                          {stintAtNight(st) && (
                            <span
                              className="ml-1 text-[10px] text-sky-300/80"
                              title={t.sched.nightWindow(
                                s.event.nightFromHour,
                                s.event.nightToHour
                              )}
                            >
                              ☾
                            </span>
                          )}
                        </td>
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
                      <td
                        className="py-1 pr-2 text-right text-zinc-300"
                        title={lapBreakdownText(t, st)}
                      >
                        {fmtLap(st.lapSec)}
                        {st.lapSec - st.baseLapSec > 0.0005 && (
                          <span className="ml-1 text-[10px] text-amber-400/80">
                            +{(st.lapSec - st.baseLapSec).toFixed(1)}
                          </span>
                        )}
                        {/* This stint is an assumption, not data: the driver has
                            no measured pace or fuel of their own and the plan
                            fell back to the Standard profile. Say so rather than
                            let it pass for a measured number. */}
                        {st.driverId && (st.paceFallback || st.fuelFallback) && (
                          <span
                            className="ml-1 text-[10px] uppercase text-amber-400/90"
                            title={t.sched.estHint(
                              st.paceFallback && st.fuelFallback
                                ? t.sched.estPaceFuel
                                : st.paceFallback
                                  ? t.sched.estPace
                                  : t.sched.estFuel
                            )}
                          >
                            {t.sched.est}
                          </span>
                        )}
                      </td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          type="number"
                          step="1"
                          min={0}
                          value={a.lapsOverride ?? ""}
                          placeholder={fmtLaps(st.laps)}
                          onChange={(e) =>
                            setAssignment(i, {
                              lapsOverride:
                                e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          title={
                            st.lapsOverridden
                              ? t.sched.lapsOverridden
                              : t.sched.lapsFromModel
                          }
                          className={`w-16 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                            st.fuelShort
                              ? "border-red-500/70 text-red-200"
                              : st.lapsOverridden
                                ? "border-amber-500/70 text-amber-200"
                                : "border-zinc-700 text-zinc-100"
                          }`}
                        />
                        {st.fuelShort && (
                          <span
                            className="ml-1 text-[10px] uppercase text-red-400"
                            title={t.sched.fuelShortMark}
                          >
                            !
                          </span>
                        )}
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">
                        {fmtLaps(st.laps)}
                      </td>
                      <td className="py-1 pr-2 text-right">
                        {fmtFuel(st.fuel)} L
                        {st.shortFill && (
                          <span
                            className="ml-1 text-[10px] uppercase text-amber-400"
                            title={t.sched.shortFillHint}
                          >
                            {t.sched.shortFill}
                          </span>
                        )}
                      </td>
                      <td
                        className={`py-1 pr-2 text-right ${
                          st.fuelShort
                            ? "font-semibold text-red-300"
                            : st.fuelAtEnd < 1
                              ? "text-amber-300"
                              : "text-zinc-400"
                        }`}
                        title={
                          st.fuelShort
                            ? t.sched.fuelShortLeft
                            : t.sched.tankAtFlag(
                                fmtFuel(st.fuelAtStart),
                                fmtFuel(st.fuelAtEnd)
                              )
                        }
                      >
                        {fmtFuel(st.fuelAtEnd)} L
                      </td>
                      {showPitCols && (
                        <>
                          <td className="py-1 pr-2 text-center print:hidden">
                            {st.isFinal ? (
                              <span className="text-zinc-600">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={a.fillLitres == null}
                                onChange={(e) =>
                                  setAssignment(i, {
                                    // Ticking hands the stop back to the model
                                    // (fill it up). Unticking starts from the
                                    // litres it would have taken, so the number
                                    // in the box is one the team can edit down
                                    // instead of an empty field.
                                    fillLitres: e.target.checked
                                      ? null
                                      : Math.round(st.fillLitres),
                                  })
                                }
                                title={t.sched.cellFull}
                              />
                            )}
                          </td>
                          <td className="hidden py-1 pr-2 text-center print:table-cell">
                            {st.isFinal ? "" : a.fillLitres == null ? "FULL" : "splash"}
                          </td>
                          <td className="py-1 pr-2 text-right print:hidden">
                            {st.isFinal || a.fillLitres == null ? (
                              <span
                                className="text-zinc-500"
                                title={st.isFinal ? undefined : "Tank filled at this stop"}
                              >
                                {st.isFinal ? "—" : `${fmtFuel(st.fillLitres)} L`}
                              </span>
                            ) : (
                              <input
                                type="number"
                                step="1"
                                min={0}
                                value={a.fillLitres}
                                onChange={(e) =>
                                  setAssignment(i, {
                                    fillLitres:
                                      e.target.value === "" ? null : Number(e.target.value),
                                  })
                                }
                                title={t.sched.cellFillL}
                                className="w-16 rounded border border-amber-500/70 bg-zinc-950 px-1.5 py-1 text-right text-sm text-amber-200"
                              />
                            )}
                          </td>
                          <td className="hidden py-1 pr-2 text-right print:table-cell">
                            {st.isFinal ? "—" : `${fmtFuel(st.fillLitres)} L`}
                          </td>
                          <td className="py-1 pr-2 text-center print:hidden">
                            {st.isFinal ? (
                              <span className="text-zinc-600">—</span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={a.tyreChange ?? true}
                                onChange={(e) => setAssignment(i, { tyreChange: e.target.checked })}
                                title={t.sched.cellTyres}
                              />
                            )}
                          </td>
                          <td className="hidden py-1 pr-2 text-center print:table-cell">
                            {st.isFinal ? "" : st.tyreChange ? "NEW" : "keep"}
                          </td>
                          <td
                            className={`py-1 pr-2 text-right ${
                              st.tyreWarn ? "font-semibold text-red-300" : "text-zinc-400"
                            }`}
                            title={
                              st.tyreWarn
                                ? `Ends below the ${s.event.tyreMinPct}% floor — change tyres earlier or shorten the stint.`
                                : `Tyres: ${st.tyreStartPct.toFixed(0)}% → ${st.tyreEndPct.toFixed(0)}%`
                            }
                          >
                            {st.tyreEndPct >= 99.999 && st.tyreStartPct >= 99.999
                              ? "—"
                              : `${st.tyreEndPct.toFixed(0)}%`}
                          </td>
                          <td
                            className="py-1 pr-2 text-right text-zinc-400"
                            title={
                              st.stop && planPitModel(s)
                                ? stopBreakdownText(st.stop, planPitModel(s)!, t)
                                : undefined
                            }
                          >
                            {st.isFinal ? "—" : `${st.stopSec.toFixed(0)}s`}
                          </td>
                        </>
                      )}
                      {advanced && (
                      <>
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
                              ? t.schedCell.tempDelta(
                                  `${st.tempDeltaSec > 0 ? "+" : ""}${st.tempDeltaSec.toFixed(2)}`
                                )
                              : t.schedCell.tempBlank
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
                      </>
                      )}
                      <td className="py-1 pr-2 text-center print:hidden">
                        <select
                          value={conditionOf(a)}
                          onChange={(e) => {
                            const c = e.target.value as StintCondition;
                            setAssignment(i, { condition: c, wet: c === "wet" });
                          }}
                          title={
                            st.weatherDeltaSec
                              ? t.schedCell.weatherDelta(st.weatherDeltaSec.toFixed(1))
                              : t.schedCell.conditionPlain
                          }
                          className={`rounded border bg-zinc-950 px-1 py-1 text-sm ${
                            st.condition === "wet"
                              ? "border-sky-700 text-sky-200"
                              : st.condition === "half"
                                ? "border-sky-900/60 text-sky-300/80"
                                : "border-zinc-700 text-zinc-400"
                          }`}
                        >
                          <option value="dry">{t.sched.condDry}</option>
                          <option value="half">{t.sched.condHalf}</option>
                          <option value="wet">{t.sched.condWet}</option>
                        </select>
                      </td>
                      <td className="hidden py-1 pr-2 text-center text-sky-300 print:table-cell">
                        {st.condition === "wet" ? "WET" : st.condition === "half" ? "½ WET" : ""}
                      </td>
                      {showNote && (
                        <>
                          <td className="py-1 pr-2 print:hidden">
                            <input
                              type="text"
                              value={a.note ?? ""}
                              onChange={(e) => setAssignment(i, { note: e.target.value })}
                              placeholder={t.schedCell.notePlaceholder}
                              className="w-44 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-sm text-zinc-100"
                            />
                          </td>
                          <td className="hidden max-w-[16rem] py-1 pr-2 align-top text-zinc-300 print:table-cell">
                            {a.note?.trim() ? a.note : "—"}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      </div>
  );

  return (
    <>
    {/* Johann prints his sheet in landscape and so should this: the schedule is
        wider than it is tall. Scoped to the planner because only this page
        renders it. */}
    <style>{`@media print { @page { size: A4 landscape; margin: 8mm; } }`}</style>
    <div className="space-y-6">
      {/* The app was redeployed while this tab was open: every Server Action
          from this build is gone, so nothing this page sends will land. */}
      {staleBuild && (
        <div className="sticky top-2 z-40 flex flex-wrap items-center justify-between gap-3 rounded border border-amber-600 bg-amber-950/80 px-4 py-3 text-sm text-amber-100 shadow-lg backdrop-blur print:hidden">
          <span>
            <strong>{t.header.staleTitle}</strong> {t.header.staleBody}
          </span>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-amber-500 px-3 py-1.5 font-semibold text-zinc-950 hover:bg-amber-400"
          >
            {t.header.reloadNow}
          </button>
        </div>
      )}

      {/* Completed: the plan is a record now, not a working document. */}
      {frozen && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 print:hidden">
          <span>
            <strong className="text-zinc-100">{t.header.frozenTitle}</strong>{" "}
            {t.header.frozenBody}
          </span>
          {curId && (
            <button
              onClick={onToggleArchived}
              disabled={archiveBusy}
              className="rounded border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-sm font-semibold text-zinc-100 hover:bg-zinc-700 disabled:opacity-50"
            >
              {archiveBusy ? t.header.reopening : t.header.reopen}
            </button>
          )}
        </div>
      )}

      {/* Header: title + actions */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-[16rem] flex-1">
          <Field label={t.header.planTitle} hint={t.header.planTitleHint}>
            <input
              className={`${inp} text-lg font-semibold disabled:opacity-70`}
              value={s.title}
              disabled={frozen}
              onChange={(e) => setS((p) => ({ ...p, title: e.target.value }))}
              placeholder={t.header.planTitlePlaceholder}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          <PlannerUiSwitch />
          {!curId && (
            <button
              onClick={() => savePlan(false)}
              disabled={saving}
              className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
            >
              {saving ? t.common.saving : t.header.saveShare}
            </button>
          )}
          {curId && !frozen && (
            <span
              className="flex items-center gap-1.5 rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300"
              title={t.header.liveHint}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              {syncStatus === "saving"
                ? t.header.liveSaving
                : syncStatus === "error"
                  ? t.header.liveError
                  : t.header.live}
            </span>
          )}
          {curId && frozen && (
            <span
              className="flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-400"
              title={t.header.completedRoHint}
            >
              <span className="inline-block h-2 w-2 rounded-full bg-zinc-500" />
              {t.header.completedRo}
            </span>
          )}
          {shareUrl && (
            <button
              onClick={() => navigator.clipboard?.writeText(shareUrl)}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              {t.header.copyLink}
            </button>
          )}
          {curId && !frozen && (
            <button
              onClick={onPostDiscord}
              disabled={postingDiscord}
              className="rounded border border-indigo-700/60 bg-indigo-950/40 px-3 py-2 text-sm text-indigo-200 hover:bg-indigo-900/40 disabled:opacity-50"
            >
              {postingDiscord ? t.header.postingDiscord : t.header.postDiscord}
            </button>
          )}
          {curId && !frozen && (
            <button
              onClick={onToggleArchived}
              disabled={archiveBusy}
              title={t.header.markCompletedHint}
              className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800 disabled:opacity-50"
            >
              {archiveBusy ? t.header.completing : t.header.markCompleted}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            {t.header.print}
          </button>
        </div>
      </div>
      {status && (
        <p className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-300">
          {status}
        </p>
      )}

      {/* Tabs. Only one is ever on screen; all of them stay in the DOM so a
          printout is the whole plan. The three setup tabs are tinted as one
          group so the split between building the plan and running it is still
          readable at a glance. */}
      <div className="sticky top-0 z-30 -mx-1 flex gap-1 rounded-lg border border-zinc-800 bg-zinc-950/95 p-1 backdrop-blur print:hidden">
        {TABS.map((x) => (
          <button
            key={x.key}
            onClick={() => setTab(x.key)}
            title={t.tabs[`${x.labelKey}Hint` as const]}
            className={`flex-1 rounded px-2 py-2 text-sm font-semibold transition ${
              tab === x.key
                ? "bg-[#ff6b35] text-zinc-950"
                : x.phase === "pre"
                  ? "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
                  : "text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            }`}
          >
            {t.tabs[x.labelKey]}
            <span className="ml-1.5 hidden text-xs font-normal opacity-70 xl:inline">
              {t.tabs[`${x.labelKey}Hint` as const]}
            </span>
          </button>
        ))}
      </div>

      {/* Only while building the plan: during and after the race the numbers
          are what they are and a checklist would be in the way. */}
      {phase === "pre" && !frozen && (
        <>
          <PlanChecklist items={checklist} onJump={jumpToCard} />
          <PlanWarnings items={warnings} />
        </>
      )}
      {/* ===== BASICS — what the race is, what a stop costs, who drives ===== */}
      {/* A completed plan freezes everything up to the flag. One disabled
          fieldset does that for every input, select, textarea and button
          inside; `contents` keeps it out of the layout. The server enforces
          the same rule, so this is convenience, not the guard. */}
      <div className={tabBox("basis")}>
      <fieldset disabled={frozen} className="contents">
      {summaryStrip}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Event config */}
        <div className={card} id="card-event">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
              {t.ev.title}
              <GuideLink section="setup" />
            </h2>
            {/* League or official. This changes NOTHING about the plan itself —
                it only decides what the post-race debrief measures against. In
                a league everybody runs the same car at a similar level, so the
                fastest man in class is a fair yardstick. In an official race
                the grid is whatever iRating turned up, and the class best then
                says nothing about how a 1500 iR driver drove. */}
            <div className="flex gap-1 print:hidden">
              {(
                [
                  ["league", t.ev.leagueRace, t.ev.leagueRaceHint],
                  ["official", t.ev.officialRace, t.ev.officialRaceHint],
                ] as const
              ).map(([kind, label, hint]) => (
                <button
                  key={kind}
                  onClick={() => patchEvent("raceKind", kind)}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    s.event.raceKind === kind
                      ? "bg-[#ff6b35] text-zinc-950"
                      : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                  title={hint}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.ev.track} hint={t.ev.trackHint}>
              <select className={inp} value={s.event.track}
                onChange={(e) => patchEvent("track", e.target.value)}>
                <option value="">{t.common.selectTrack}</option>
                {trackOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field label={t.ev.car} hint={t.ev.carHint}>
              <select className={inp} value={s.event.car}
                onChange={(e) => patchEvent("car", e.target.value)}>
                <option value="">{t.common.selectCar}</option>
                {carOptions.map((c) => (
                  <option key={c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label={t.ev.raceEndsOn} hint={t.ev.raceEndsOnHint}>
              <select
                className={inp}
                value={s.event.raceLimit}
                onChange={(e) => patchEvent("raceLimit", e.target.value)}
              >
                <option value="time">{t.ev.optTime}</option>
                <option value="laps">{t.ev.optLaps}</option>
                <option value="distance">{t.ev.optDistance}</option>
              </select>
            </Field>
            {s.event.raceLimit === "time" && (
              <Field label={t.ev.raceDuration} hint={t.ev.raceDurationHint}>
                <input className={inp} value={s.event.raceDuration}
                  onChange={(e) => patchEvent("raceDuration", e.target.value)} />
              </Field>
            )}
            {s.event.raceLimit === "time" && (
              <div className="col-span-2">
                <label className="flex items-start gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={s.event.roundRaceEnd === true}
                    onChange={(e) => patchEvent("roundRaceEnd", e.target.checked)}
                  />
                  <span>
                    <span className="font-medium text-zinc-300">
                      {t.ev.roundRaceEnd}
                    </span>{" "}
                    {t.ev.roundRaceEndBody}
                    {result.raceEndRounded && (
                      <>
                        {" "}
                        {t.ev.projectedFinishLabel}{" "}
                        <strong className="text-zinc-300">
                          {fmtDuration(result.raceSec)}
                        </strong>{" "}
                        (+{fmtDuration(Math.max(0, result.raceSec - (parseDurationToSec(s.event.raceDuration) ?? 0)))}).
                      </>
                    )}
                  </span>
                </label>
              </div>
            )}
            {s.event.raceLimit === "laps" && (
              <Field label={t.ev.raceLaps} hint={t.ev.raceLapsHint}>
                <input className={inp} value={s.event.raceLaps}
                  onChange={(e) => patchEvent("raceLaps", e.target.value)}
                  placeholder={t.ev.raceLapsPlaceholder} />
              </Field>
            )}
            {s.event.raceLimit === "distance" && (
              <>
                <Field label={t.ev.raceDistance} hint={t.ev.raceDistanceHint}>
                  <div className="flex gap-1">
                    <input className={inp} value={s.event.raceDistance}
                      onChange={(e) => patchEvent("raceDistance", e.target.value)}
                      placeholder={t.ev.raceDistancePlaceholder} />
                    <select
                      className={`${inp} w-20 shrink-0`}
                      value={s.event.distanceUnit}
                      onChange={(e) => patchEvent("distanceUnit", e.target.value)}
                    >
                      <option value="km">km</option>
                      <option value="mi">mi</option>
                    </select>
                  </div>
                </Field>
                <Field label={t.ev.lapLength} hint={t.ev.lapLengthHint}>
                  <input className={inp} value={s.event.lapDistanceKm}
                    onChange={(e) => patchEvent("lapDistanceKm", e.target.value)}
                    placeholder={t.ev.lapLengthPlaceholder} />
                </Field>
              </>
            )}
            {lapTarget != null && (
              <div className="col-span-2 -mt-1 text-[11px] text-zinc-500">
                {s.event.raceLimit === "distance" ? (
                  <>
                    {s.event.raceDistance} {s.event.distanceUnit} ÷{" "}
                    {s.event.lapDistanceKm} km ={" "}
                    <strong className="text-zinc-300">{t.ev.laps(lapTarget)}</strong>{" "}
                    {t.ev.roundedUp}{" "}
                  </>
                ) : (
                  <>
                    {t.ev.raceEndsAfter}{" "}
                    <strong className="text-zinc-300">{t.ev.laps(lapTarget)}</strong>.{" "}
                  </>
                )}
                {t.ev.projectedFinishLabel}{" "}
                <strong className="text-zinc-300">{fmtDuration(result.raceSec)}</strong>
                {result.lapsShort > 0 && (
                  <span className="text-amber-300">
                    {" "}
                    {t.ev.lapsUnplanned(fmtLaps(result.lapsShort))}
                  </span>
                )}
              </div>
            )}
            <Field label={t.ev.raceStart} hint={t.ev.raceStartHint}>
              <div className="flex gap-1">
                <input type="datetime-local" step="1" className={inp}
                  value={s.event.sessionStartLocal}
                  onChange={(e) => patchEvent("sessionStartLocal", e.target.value)} />
                <button
                  type="button"
                  onClick={setRaceStartNow}
                  title={t.ev.nowHint}
                  className="shrink-0 rounded border border-emerald-800/60 bg-emerald-950/40 px-2 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40 print:hidden"
                >
                  {t.ev.now}
                </button>
              </div>
              <p className="mt-1 text-[10px] leading-tight text-zinc-500">
                {t.ev.nowAlsoDuring}
              </p>
            </Field>
            {/* Everything a STOP costs now lives in one card. It used to be
                split — flat pit loss, refuel time and driver swap here, the
                measured constants two cards down — which is exactly the
                grouping Johann's layout sketch called out (07.09.2026). This
                card answers "what is the race", the pit card answers "what
                does a stop cost". */}
            <p className="col-span-2 -mt-1 rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2 text-[11px] leading-snug text-zinc-500">
              {pitOn ? (
                <>
                  {t.ev.stopComputedPre}{" "}
                  <strong className="text-zinc-300">
                    {fullServiceStopSec(s).toFixed(1)} s
                  </strong>{" "}
                  {t.ev.stopComputedPost}
                </>
              ) : (
                <>
                  {t.ev.stopFlatPre}{" "}
                  <strong className="text-zinc-300">
                    {s.event.pitLoss || "—"} s
                  </strong>
                  {t.ev.stopFlatPost}
                </>
              )}{" "}
              {t.ev.stopWhere}{" "}
              <span className="text-orange-300">{t.pit.title}</span>.
            </p>
            <Field label={t.ev.tank} hint={t.ev.tankHint}>
              <input className={inp} value={s.event.tankSize}
                onChange={(e) => patchEvent("tankSize", e.target.value)} />
            </Field>
            <Field label={t.ev.reserve} hint={t.ev.reserveHint}>
              <input className={inp} value={s.event.fuelReserve}
                onChange={(e) => patchEvent("fuelReserve", e.target.value)}
                placeholder="0" />
            </Field>
            <Field label={t.ev.gridFuel} hint={t.ev.gridFuelHint}>
              <input className={inp} value={s.event.gridFuelL}
                onChange={(e) => patchEvent("gridFuelL", e.target.value)}
                placeholder={t.ev.gridFuelPlaceholder} />
            </Field>
            {/* The stint-margin checkbox lived here until v2.21.0 — one lap off
                every fuel-limited stint. Removed on Thomas's call: "Margin Lap"
                now names the +1 lap at the finish, and two controls cannot wear
                the same name. No saved plan had it on (checked against the live
                DB), so nothing re-times. `PlannerInput.marginLap` still exists
                and is still honoured, so an archived payload that carries it
                computes exactly as it was signed off. */}
            {/* "Fair share" moved out of here in v2.26.0 — it steers how the
                automatic line-up divides the laps, so it belongs with the
                availability and stint preferences it is weighed against, not
                among the fuel fields. */}
            {official && (
              /* Boxed, not just sub-headed: these two only exist for an
                 official race, and a field that applies conditionally should
                 look conditional. */
              <div className="col-span-2 rounded border border-cyan-900/50 bg-cyan-950/10 p-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-cyan-300">
                  {t.ev.officialBox}
                </div>
                <div className="grid grid-cols-2 gap-3">
                <Field label={t.ev.refLap} hint={t.ev.refLapHint}>
                  <input
                    className={inp}
                    value={s.event.refLap}
                    onChange={(e) => patchEvent("refLap", e.target.value)}
                    placeholder={
                      paceCurve
                        ? fmtPaceSec(targetLapSec(paceCurve.points, 10000)?.sec ?? null)
                        : "1:58.775"
                    }
                  />
                </Field>
                <Field label={t.ev.paceCurve} hint={t.ev.paceCurveHint}>
                  <select
                    className={inp}
                    value={s.event.paceCurveId}
                    onChange={(e) => patchEvent("paceCurveId", e.target.value)}
                  >
                    <option value="">{t.ev.curveNone}</option>
                    {paceReferences.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label} ({r.sessionType})
                      </option>
                    ))}
                  </select>
                </Field>
                <p className="col-span-2 -mt-1 text-[11px] leading-snug text-zinc-500">
                  {paceCurve ? (
                    <>
                      {t.ev.curveExplainPre}{" "}
                      {t.ev.curveExplainPoints(paceCurve.points.length)}{" "}
                      {fmtPaceSec(targetLapSec(paceCurve.points, 1000)?.sec ?? null)}{" "}
                      {t.ev.curveExplainAt1000}{" "}
                      <span className="text-cyan-300">
                        {fmtPaceSec(targetLapSec(paceCurve.points, 10000)?.sec ?? null)}
                      </span>{" "}
                      {t.ev.curveExplainAt10k}{" "}
                      <span className="font-mono">eventresult.json</span>.
                    </>
                  ) : paceSuggestion ? (
                    <>
                      {t.ev.curveSuggestPre}{" "}
                      <button
                        onClick={() => patchEvent("paceCurveId", paceSuggestion.id)}
                        className="text-[#ff6b35] underline print:hidden"
                      >
                        {paceSuggestion.label}
                      </button>{" "}
                      {t.ev.curveSuggestPost}
                    </>
                  ) : (
                    <>
                      {t.ev.curveNonePre}{" "}
                      <a
                        href="/teams/statistics/pace-references"
                        className="text-[#ff6b35] underline print:hidden"
                      >
                        {t.ev.curveNoneLink}
                      </a>
                      {t.ev.curveNonePost}
                    </>
                  )}
                </p>
                </div>
              </div>
            )}
            <Field label={t.ev.trackTemp} hint={t.ev.trackTempHint}>
              <input className={inp} value={s.event.trackTempC}
                onChange={(e) => patchEvent("trackTempC", e.target.value)}
                onBlur={(e) => applyTempFromInput(e.target.value)}
                placeholder={t.ev.trackTempPlaceholder} />
            </Field>
          </div>
        </div>

        {/* Roster — who is on this plan, and the one place to add someone.
            The table that settles their pace and fuel sits far below now (after
            the Garage 61 charts, because that is the order the work happens
            in), which left no obvious place to build the line-up while setting
            the race up. This is that place; the numbers stay down there. */}
        <div className={card} id="card-drivers">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
              {t.roster.title}
              <GuideLink section="setup" />
            </h2>
            <ClsDriverPicker
              options={clsDrivers.filter(
                (d) => !s.drivers.some((r) => r.id === d.id)
              )}
              onPick={addClsDriver}
            />
          </div>
          {s.drivers.length === 0 ? (
            <p className="text-sm text-zinc-500">{t.roster.empty}</p>
          ) : (
            (() => {
              const missing = s.drivers.filter(
                (d) => !d.laptime.trim() || !d.fuelPerLap?.trim()
              );
              return (
                <>
                  <div className="flex flex-wrap gap-1.5">
                    {s.drivers.map((d) => {
                      const gap = !d.laptime.trim() || !d.fuelPerLap?.trim();
                      return (
                        <span
                          key={d.id}
                          title={
                            gap
                              ? t.roster.gapHint
                              : t.roster.ownFigures(d.laptime, d.fuelPerLap ?? "—")
                          }
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${
                            gap
                              ? "border-amber-800/60 bg-amber-950/20 text-amber-100"
                              : "border-zinc-700 bg-zinc-900/60 text-zinc-200"
                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${driverColour(d.id).dot}`}
                          />
                          {d.name}
                        </span>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    {t.roster.countPre(s.drivers.length)} {t.roster.countPost}{" "}
                    <strong className="text-zinc-400">{t.roster.driversWord}</strong>{" "}
                    {t.roster.countPost2}
                    {missing.length > 0 && (
                      <span className="text-amber-300">
                        {" "}
                        {t.roster.missing(missing.length)}
                      </span>
                    )}
                  </p>
                </>
              );
            })()
          )}
        </div>

        {/* Pit-stop model — measured constants instead of one flat number.
            Off by default: an existing plan keeps its flat pit loss until
            somebody switches this on. */}
        <div className={card} id="card-pit">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
              {t.pit.title}
              <GuideLink section="setup" />
            </h2>
            <div className="flex flex-wrap items-center gap-2">
            {/* Both of these only steer the DETAILED model, so Easy mode has
                no use for either. Folded away, nothing here applies either. */}
            {!pitCollapsed && (
            <AdvancedOnly>
              <div className="flex flex-wrap items-center gap-3">
                {(pitRef.exact || pitRef.carDefault) && (
                  <button
                    onClick={() => applyPitReference((pitRef.exact ?? pitRef.carDefault)!)}
                    className="rounded border border-emerald-800/60 bg-emerald-950/30 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/40 print:hidden"
                    title={
                      pitRef.exact
                        ? t.pit.loadMeasuredExact(
                            pitRef.exact.car,
                            pitRef.exact.track,
                            pitRef.exact.source ?? null
                          )
                        : t.pit.loadMeasuredDefault(
                            pitRef.carDefault!.car,
                            pitRef.carDefault!.source ?? null
                          )
                    }
                  >
                    {pitRef.exact ? t.pit.loadMeasured : t.pit.loadMeasuredCarDefault}
                  </button>
                )}
                <CheckField
                  checked={s.event.pitModelOn}
                  onChange={(v) => patchEvent("pitModelOn", v)}
                  label={t.pit.computeEvery}
                  hint={t.pit.computeEveryHint}
                />
              </div>
            </AdvancedOnly>
            )}
            {/* NOT a <button>: a completed plan renders this whole tab inside
                a disabled fieldset, and a disabled fieldset disables every
                form control under it — which would leave a frozen plan with a
                pit card nobody can open. Folding is a view preference, so it
                has no business being frozen with the data. */}
            <span
              role="button"
              tabIndex={0}
              onClick={() => setPitCollapsed(!pitCollapsed)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setPitCollapsed(!pitCollapsed);
                }
              }}
              title={pitCollapsed ? t.pit.showHint : t.pit.hideHint}
              className="cursor-pointer select-none rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 print:hidden"
            >
              {pitCollapsed ? t.pit.show : t.pit.hide}
            </span>
            </div>
          </div>
          {pitCollapsed ? (
            <p className="text-xs text-zinc-500">
              {s.event.pitModelOn
                ? t.pit.collapsedDetailed
                : t.pit.collapsedFlat(s.event.pitLoss || "—")}{" "}
              {t.pit.collapsedNote}
            </p>
          ) : (
          <>
          {!s.event.pitModelOn ? (
            <>
              {/* The two numbers the SIMPLE model runs on, plus the swap floor
                  it shares with the detailed one. */}
              <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-3">
                <Field label={t.pit.pitLoss} hint={t.pit.pitLossHint}>
                  <input className={inp} value={s.event.pitLoss}
                    onChange={(e) => patchEvent("pitLoss", e.target.value)} />
                </Field>
                <Field label={t.pit.refuelSec} hint={t.pit.refuelSecHint}>
                  <input className={inp} value={s.event.refuelSec}
                    onChange={(e) => patchEvent("refuelSec", e.target.value)}
                    placeholder={t.pit.refuelSecPlaceholder} />
                </Field>
                <Field label={t.pit.driverSwap} hint={t.pit.driverSwapHint}>
                  <input className={inp} value={s.event.driverSwapSec}
                    onChange={(e) => patchEvent("driverSwapSec", e.target.value)}
                    placeholder="30" />
                </Field>
              </div>
              {/* The invitation to switch the detailed model on only makes
                  sense next to the switch, which Easy mode does not show. */}
              <AdvancedOnly>
                <p className="text-xs text-zinc-500">
                  {t.pit.flatPre}{" "}
                  <strong className="text-zinc-300">{s.event.pitLoss || "—"} s</strong>
                  {t.pit.flatPost}
                </p>
              </AdvancedOnly>
            </>
          ) : (
            /* The detailed model is the one Advanced-only block: it is nine
               fields, a session upload and a measuring protocol, and a team
               that has never measured a stop will not miss it. */
            <AdvancedOnly>
              {/* Everything left in this card is a MEASURED value — the three
                  numbers a session export produces, plus how the crew works.
                  Anything you have to decide yourself lives in Event or, when
                  it differs per driver, in the driver table. */}
              <p className="mb-3 text-[11px] text-zinc-500">
                <strong className="text-emerald-300">{t.pit.measuredTitle}</strong>{" "}
                {t.pit.measuredBodyPre} <em>{t.pit.measuredBodyEm}</em>{" "}
                {t.pit.measuredBodyPost}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t.pit.laneLoss} hint={t.pit.laneLossHint}>
                  <input
                    className={inp}
                    value={s.event.pitLaneLossSec}
                    onChange={(e) => patchEvent("pitLaneLossSec", e.target.value)}
                    placeholder="41"
                  />
                </Field>
                <Field label={t.pit.refuelRate} hint={t.pit.refuelRateHint}>
                  <input
                    className={inp}
                    value={s.event.refuelLps}
                    onChange={(e) => patchEvent("refuelLps", e.target.value)}
                    placeholder="2.5"
                  />
                </Field>
                <Field label={t.pit.tyreChange} hint={t.pit.tyreChangeHint}>
                  <input
                    className={inp}
                    value={s.event.tyreChangeSec}
                    onChange={(e) => patchEvent("tyreChangeSec", e.target.value)}
                    placeholder="20"
                  />
                </Field>
                <CheckField
                  className="flex items-end"
                  checked={s.event.tyreSequential !== false}
                  onChange={(v) => patchEvent("tyreSequential", v)}
                  label={t.pit.tyresAfter}
                  hint={t.pit.tyresAfterHint}
                />
                {/* Not measured but part of the stop: the swap floor the
                    detailed model uses as driverChangeSec. */}
                <Field label={t.pit.driverSwap} hint={t.pit.driverSwapHintShort}>
                  <input
                    className={inp}
                    value={s.event.driverSwapSec}
                    onChange={(e) => patchEvent("driverSwapSec", e.target.value)}
                    placeholder="30"
                  />
                </Field>
              </div>
              {(() => {
                const model = planPitModel(s);
                if (!model) {
                  return (
                    <>
                      <p className="mt-3 text-xs text-amber-300">{t.pit.noModelWarn}</p>
                      <p className="mt-1 text-[11px] text-zinc-500">{t.pit.noModelHow}</p>
                    </>
                  );
                }
                const usable = Math.max(
                  0,
                  parseTypedNumber(s.event.tankSize) - parseTypedNumber(s.event.fuelReserve)
                );
                const full = pitStopSeconds(model, {
                  litres: usable,
                  tyres: true,
                  driverChange: true,
                });
                const splash = pitStopSeconds(model, {
                  litres: usable / 2,
                  tyres: false,
                  driverChange: false,
                });
                return (
                  <div className="mt-3 space-y-1 text-xs text-zinc-400">
                    <div>
                      {t.pit.fullService(fmtFuel(usable))}{" "}
                      <strong className="text-zinc-200">{full.totalSec.toFixed(1)} s</strong>{" "}
                      <span className="text-zinc-500">
                        ({stopBreakdownText(full, model, t)})
                      </span>
                    </div>
                    <div>
                      {t.pit.halfFill}{" "}
                      <strong className="text-emerald-300">{splash.totalSec.toFixed(1)} s</strong>{" "}
                      <span className="text-zinc-500">
                        {t.pit.cheaperThanFull((full.totalSec - splash.totalSec).toFixed(0))}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* The only place these four numbers can come from — put right
                  under the fields it fills, so nobody has to know that the
                  Garage 61 card is where the file goes. */}
              <div className="mt-4 rounded border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    {t.pit.measureTitle}
                  </div>
                  <label className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800 print:hidden">
                    {g61Busy ? t.pit.reading : t.pit.uploadXlsx}
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
                {/* The same handler as the Garage 61 card: a file dropped here
                    measures the stops AND feeds the lap pool. That is useful —
                    it is one file with both kinds of data in it — but it must
                    not be invisible, so the pool switch is repeated here
                    instead of living two cards away. */}
                <label
                  className="mt-2 flex cursor-pointer items-start gap-1.5 text-[11px] text-zinc-500 print:hidden"
                  title={t.pit.poolHint}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={s.g61Cumulative === true}
                    onChange={(e) =>
                      setS((p) => ({ ...p, g61Cumulative: e.target.checked }))
                    }
                  />
                  <span>
                    {t.pit.poolPre}{" "}
                    <strong className="text-zinc-400">{t.pit.poolBoldPool}</strong>{" "}
                    {t.pit.poolMid}{" "}
                    <strong className="text-zinc-400">{t.pit.poolBoldAdded}</strong>
                    {t.pit.poolMid2 ? ` ${t.pit.poolMid2}` : ""}
                    {(s.g61Sources?.length ?? 0) > 0
                      ? t.pit.poolCount(poolLapCount(s.g61Sources), s.g61Sources.length)
                      : ""}
                    {t.pit.poolPost}
                  </span>
                </label>
                <p className="mt-2 text-[11px] text-zinc-500">
                  {t.pit.exportExplainPre}
                  <strong className="text-zinc-400">{t.pit.exportExplainBold}</strong>{" "}
                  {t.pit.exportExplainMid}
                  <em>{t.pit.exportExplainEm}</em> {t.pit.exportExplainPost}
                </p>
                <details className="mt-2 print:hidden">
                  <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
                    {t.pit.howToDrive}
                  </summary>
                  <p className="mt-1 text-[11px] text-zinc-500">{t.pit.protocol}</p>
                </details>
                {g61Msg && <p className="mt-2 text-xs text-amber-300">{g61Msg}</p>}
                {/* Pit stops found in the uploaded session — Johann's measuring sheet,
                    done by the machine. The data knows the time lost and the litres;
                    only a human knows whether tyres went on. */}
                {pitScan && !pitScan.ok && (
                  <div className="mb-3 rounded border border-amber-900/50 bg-amber-950/10 p-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-300">
                      {t.pit.noStops}
                    </div>
                    <p className="text-[11px] text-zinc-400">{pitScan.error}</p>
                    <p className="mt-2 text-[11px] text-zinc-500">{t.pit.protocol}</p>
                  </div>
                )}

                {pitScan && pitScan.ok && (
                  <div className="mb-3 rounded border border-orange-900/50 bg-orange-950/10 p-3">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-orange-300">
                      {t.pit.stopsFound(pitScan.stops.length)}
                    </div>
                    <p className="mb-2 text-[11px] text-zinc-500">
                      {t.pit.referenceSection(
                        pitScan.referenceSec?.toFixed(1) ?? "—",
                        pitScan.referenceSamples
                      )}
                    </p>
                    <p className="mb-2 text-[11px] text-zinc-500">{t.pit.protocol}</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm tabular-nums">
                        <thead className="text-xs uppercase tracking-wide text-zinc-500">
                          <tr className="border-b border-zinc-800">
                            <th className="py-1 pr-2">{t.pit.colLap}</th>
                            <th className="py-1 pr-2">{t.pit.colDriver}</th>
                            <th className="py-1 pr-2 text-right">{t.pit.colTimeLost}</th>
                            <th className="py-1 pr-2 text-right">{t.pit.colFuel}</th>
                            <th className="py-1 pr-2">{t.pit.colWhatHappened}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pitScan.stops.map((st, i) => (
                            <tr key={`${st.lap}-${i}`} className="border-t border-zinc-800/60 text-zinc-200">
                              <td className="py-1 pr-2 text-zinc-500">{st.lap}</td>
                              <td className="py-1 pr-2">{st.driver}</td>
                              <td className="py-1 pr-2 text-right font-medium">{st.lossSec.toFixed(1)} s</td>
                              <td className="py-1 pr-2 text-right text-zinc-400">
                                {st.litres > 0 ? `${st.litres.toFixed(1)} L` : "—"}
                              </td>
                              <td className="py-1 pr-2">
                                <select
                                  value={pitKinds[i] ?? st.kind}
                                  onChange={(e) =>
                                    setPitKinds((prev) => {
                                      const next = [...prev];
                                      next[i] = e.target.value as StopKind;
                                      return next;
                                    })
                                  }
                                  className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-sm text-zinc-100"
                                >
                                  <option value="drivethrough">{t.pit.kindDrivethrough}</option>
                                  <option value="stop">{t.pit.kindStop}</option>
                                  <option value="tyres">{t.pit.kindTyres}</option>
                                  <option value="fuel">{t.pit.kindFuel}</option>
                                  <option value="fuel+tyres">{t.pit.kindFuelTyres}</option>
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const c = derivePitConstants(labelledStops());
                      const fmtOrDash = (v: number | null, unit: string, digits = 1) =>
                        v != null ? `${v.toFixed(digits)} ${unit}` : "—";
                      return (
                        <div className="mt-3 space-y-2">
                          <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                            <span>
                              {t.pit.derivedLane}{" "}
                              <strong className={c.laneLossSec != null ? "text-emerald-300" : "text-zinc-500"}>
                                {fmtOrDash(c.laneLossSec, "s")}
                              </strong>
                            </span>
                            <span>
                              {t.pit.derivedTyre}{" "}
                              <strong className={c.tyreChangeSec != null ? "text-emerald-300" : "text-zinc-500"}>
                                {fmtOrDash(c.tyreChangeSec, "s")}
                              </strong>
                            </span>
                            <span>
                              {t.pit.derivedRefuel}{" "}
                              <strong className={c.refuelLps != null ? "text-emerald-300" : "text-zinc-500"}>
                                {fmtOrDash(c.refuelLps, "L/s", 2)}
                              </strong>
                            </span>
                            {c.tyreSequential != null && (
                              <span className="text-zinc-400">
                                {c.tyreSequential ? t.pit.derivedSequential : t.pit.derivedParallel}
                              </span>
                            )}
                          </div>
                          {c.notes.length > 0 && (
                            <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-zinc-500">
                              {c.notes.map((n, i) => (
                                <li key={i}>{n}</li>
                              ))}
                            </ul>
                          )}
                          <div className="flex flex-wrap items-center gap-2 print:hidden">
                            <button
                              onClick={applyDerivedPit}
                              className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500"
                            >
                              {t.pit.useInPlan}
                            </button>
                            {viewerIsAdmin && (
                              <button
                                onClick={() => void saveDerivedPitToLibrary()}
                                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
                                title={t.pit.saveToLibraryHint(s.event.car, s.event.track)}
                              >
                                {t.pit.saveToLibrary}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setPitScan(null);
                                setPitSaveMsg(null);
                              }}
                              className="rounded px-2 py-1.5 text-sm text-zinc-500 hover:text-zinc-300"
                            >
                              {t.pit.dismiss}
                            </button>
                          </div>
                          {pitSaveMsg && <p className="text-xs text-emerald-300">{pitSaveMsg}</p>}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            </AdvancedOnly>
          )}
          </>
          )}
        </div>
      </div>

      </fieldset>
      </div>

      {/* ===== PACE & FUEL — what the TEAM runs ===== */}
      <div className={tabBox("prep")}>
      <fieldset disabled={frozen} className="contents">
      {summaryStrip}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Fuel profiles */}
        <div className={card} id="card-fuel">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
              {t.fuel.title}
              <GuideLink section="pace" />
            </h2>
            {deltaSaving && (
              <button
                onClick={() => setShowFuelProfiles((v) => !v)}
                className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-400 hover:bg-zinc-800 print:hidden"
              >
                {showFuelProfiles ? t.fuel.hideFallback : t.fuel.editFallback}
              </button>
            )}
          </div>

          {/* How long a stint is, and how far the tyres may go — moved up from
              the Event card on Johann Solowej's layout (Sept 2026). They
              qualify the profiles directly below them; Event answers what the
              race is. */}
          <div className="mb-3 grid grid-cols-2 gap-3">
            <Field label={t.ev.stintLength} hint={t.ev.stintLengthHint}>
              <select className={inp} value={s.event.stintMode}
                onChange={(e) => patchEvent("stintMode", e.target.value)}>
                <option value="fuel">{t.ev.stintFuel}</option>
                <option value="time">{t.ev.stintTime}</option>
                <option value="laps">{t.ev.stintLaps}</option>
              </select>
            </Field>
            {s.event.stintMode !== "fuel" && (
              <Field
                label={s.event.stintMode === "time" ? t.ev.stintMinutes : t.ev.stintLapsField}
                hint={t.ev.stintValueHint}
              >
                <input className={inp} value={s.event.stintValue}
                  onChange={(e) => patchEvent("stintValue", e.target.value)}
                  placeholder={s.event.stintMode === "time" ? "45" : "20"} />
              </Field>
            )}
            <Field label={t.ev.tyreMin} hint={t.ev.tyreMinHint}>
              <input className={inp} value={s.event.tyreMinPct}
                onChange={(e) => patchEvent("tyreMinPct", e.target.value)}
                placeholder="50" />
            </Field>
          </div>

          {profilesOpen ? (
            <ProfileRow
              title={deltaSaving ? t.fuel.standardFallback : t.fuel.standard}
              laptime={s.standard.laptime}
              fuelPerLap={s.standard.fuelPerLap}
              onLaptime={(v) => patchStd("laptime", v)}
              onFuel={(v) => patchStd("fuelPerLap", v)}
              laps={std.laps}
              green={std.greenTimeSec}
              total={std.totalTimeSec}
              fuel={std.fuelPerStint}
            />
          ) : (
            <p className="rounded border border-zinc-800 bg-zinc-950/50 px-2.5 py-2 text-xs leading-snug text-zinc-500">
              {t.fuel.fallbackPre}{" "}
              <strong className="text-zinc-300">
                {s.standard.laptime || "—"}
              </strong>{" "}
              /{" "}
              <strong className="text-zinc-300">
                {s.standard.fuelPerLap || "—"} L
              </strong>
              {s.savingEnabled && (
                <>
                  {t.fuel.fallbackSavingPre}{" "}
                  <strong className="text-cyan-300">
                    +{planDelta.sec.toFixed(1)} s / &minus;{planDelta.litres.toFixed(2)} L
                  </strong>
                </>
              )}
              .
            </p>
          )}

          {/* How a stint gets its pace and fuel. The old model let the profile
              decide for everyone, which meant a driver's own averages either
              replaced it wholesale (standard stints) or were quietly ignored
              (fuel-save stints). The delta model below fixes both.

              Advanced-only: it is a choice a plan makes once, and the wrong
              answer is not recoverable by guessing. It keeps computing either
              way — Easy hides the switch, never the effect. */}
          <AdvancedOnly>
          <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/50 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {t.fuel.whereNumbers}
            </div>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["delta", t.fuel.modeDelta],
                  ["absolute", t.fuel.modeAbsolute],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  onClick={() => setS((p) => ({ ...p, savingMode: mode }))}
                  className={`rounded px-2.5 py-1 text-xs font-semibold ${
                    (s.savingMode ?? "absolute") === mode
                      ? "bg-[#ff6b35] text-zinc-950"
                      : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {deltaSaving ? (
                <>
                  {t.fuel.deltaExplainPre}{" "}
                  <strong className="text-zinc-300">{t.fuel.deltaExplainBold}</strong>{" "}
                  {t.fuel.deltaExplainPost}
                </>
              ) : (
                t.fuel.absoluteExplain
              )}
            </p>
          </div>
          </AdvancedOnly>

          <CheckField
            className="mt-3"
            checked={s.savingEnabled}
            onChange={(v) => setS((p) => ({ ...p, savingEnabled: v }))}
            label={t.fuel.enableSaving}
            hint={t.fuel.enableSavingHint}
          />
          {s.savingEnabled && sav && profilesOpen && (
            <div className="mt-2">
              <ProfileRow
                title={deltaSaving ? t.fuel.savingFallback : t.fuel.savingProfile}
                laptime={s.saving.laptime}
                fuelPerLap={s.saving.fuelPerLap}
                onLaptime={(v) => patchSav("laptime", v)}
                onFuel={(v) => patchSav("fuelPerLap", v)}
                laps={sav.laps}
                green={sav.greenTimeSec}
                total={sav.totalTimeSec}
                fuel={sav.fuelPerStint}
              />
              {deltaSaving && (
                <p className="mt-2 text-xs text-zinc-500">
                  {t.fuel.againstStandardPre}{" "}
                  <strong className="text-cyan-300">
                    +{planDelta.sec.toFixed(1)} s/{t.units.lap} / &minus;
                    {planDelta.litres.toFixed(2)} L/{t.units.lap}
                  </strong>{" "}
                  {t.fuel.againstStandardMid}{" "}
                  <span className="text-zinc-400">{t.fuel.fsShort}</span>
                  {t.fuel.againstStandardMid2}{" "}
                  <strong className="text-zinc-400">{t.fuel.fsPlusS}</strong> /{" "}
                  <strong className="text-zinc-400">{t.fuel.fsMinusL}</strong>{" "}
                  {t.fuel.againstStandardPost}
                  {planDelta.sec <= 0 && planDelta.litres <= 0 && (
                    <span className="text-amber-400"> {t.fuel.deltaZero}</span>
                  )}
                </p>
              )}
            </div>
          )}
          {(std.overFuel || (sav != null && sav.overFuel)) && (
            <p className="mt-3 text-xs text-amber-400">{t.fuel.overFuel}</p>
          )}

          {/* The rain profile.
              Johann Solowej asked for this (Sept 2026) and the gap was real:
              the wet model was a lap-time penalty only, so a wet stint was
              fuelled at the DRY consumption and came up short. A wet lap is
              slower and therefore burns less, which is exactly the case where
              being wrong costs a stop. */}
          <div className="mt-3 rounded border border-sky-900/50 bg-sky-950/10 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-sky-300">
              {t.jo.rainProfile}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t.fuel.lapTime} hint={t.jo.rainLead}>
                <input
                  className={inp}
                  value={s.rain?.laptime ?? ""}
                  onChange={(e) => patchRain("laptime", e.target.value)}
                  placeholder={s.standard.laptime || "m:ss.s"}
                />
              </Field>
              <Field label={t.fuel.fuelPerLap} hint={t.jo.rainLead}>
                <input
                  className={inp}
                  value={s.rain?.fuelPerLap ?? ""}
                  onChange={(e) => patchRain("fuelPerLap", e.target.value)}
                  placeholder={s.standard.fuelPerLap || "L"}
                />
              </Field>
            </div>
            <p className="mt-2 text-[11px] leading-snug text-zinc-500">
              {(() => {
                const rain = rainProfileOf(s);
                const dry = parseDurationToSec(s.standard.laptime);
                if (rain && dry && dry > 0) {
                  return t.jo.rainActive(
                    round1(rain.laptimeSec - dry).toFixed(1),
                    rain.fuelPerLap.toFixed(2)
                  );
                }
                const half =
                  (s.rain?.laptime ?? "").trim() !== "" ||
                  (s.rain?.fuelPerLap ?? "").trim() !== "";
                return half ? t.jo.rainNeedsBoth : t.jo.rainLead;
              })()}
            </p>
          </div>
        </div>

      {/* Pace corrections — temperature, weather, traffic.
          These three sat on the Basics tab under the track temperature, which
          is where the number gets typed but not where the work happens: you
          settle them once the pace itself is settled, which is this tab.
          Advanced only — in Easy mode a plan runs on the standard lap time
          alone. */}
      <AdvancedOnly>
      <div className={card} id="card-paceadj">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.ev.paceAdjTitle}
            <GuideLink section="pace" />
          </h2>
        </div>
          {(s.tempModel || s.event.trackTempC.trim() !== "") && (
            <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/40 p-2.5 text-[11px] text-zinc-400">
              {(() => {
                const tm = s.tempModel;
                const raceT = parseTypedNumber(s.event.trackTempC, NaN);
                const hasRaceT =
                  s.event.trackTempC.trim() !== "" && isFinite(raceT);
                if (!tm) {
                  return <span>{t.ev.tempNoModel}</span>;
                }
                const per10 = round1(tm.slopePerC * 10);
                const pending =
                  hasRaceT && tm.appliedTempC != null
                    ? tm.slopePerC * (raceT - tm.appliedTempC)
                    : 0;
                return (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span>
                      {t.ev.tempPaceSetAt}{" "}
                      <strong className="text-zinc-200">
                        {tm.appliedTempC != null
                          ? `${round1(tm.appliedTempC)}°C`
                          : "—"}
                      </strong>{" "}
                      {t.ev.tempSensitivity}{" "}
                      <strong className="text-zinc-200">
                        {per10 >= 0 ? "+" : ""}
                        {per10.toFixed(1)} s/10°C
                      </strong>{" "}
                      <span className="text-zinc-500">
                        {tm.fromData ? t.ev.tempFromData : t.ev.tempManual}
                      </span>
                    </span>
                    {Math.abs(pending) > 0.05 && (
                      <span className="text-amber-300">
                        {t.ev.tempPending(
                          `${pending > 0 ? "+" : ""}${pending.toFixed(1)}`,
                          round1(raceT)
                        )}
                      </span>
                    )}
                    {!tm.fromData && (
                      <label className="flex items-center gap-1 text-zinc-500 print:hidden">
                        {t.ev.tempPer10}
                        <input
                          className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-zinc-100"
                          defaultValue={String(per10)}
                          onBlur={(e) => setManualSlopePer10(e.target.value)}
                          title={t.ev.tempPer10Hint}
                        />
                        <Hint text={t.ev.tempPer10Hint} />
                      </label>
                    )}
                  </div>
                );
              })()}
            </div>
          )}

          {/* Pace penalties: weather per stint, traffic on every stint. */}
          <div className="mt-3 space-y-2 rounded border border-zinc-800 bg-zinc-950/40 p-2.5 text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 uppercase tracking-wider text-zinc-500">
                {t.ev.fullWet}
                <Hint text={t.ev.fullWetHint} />
              </span>
              <label className="flex items-center gap-1 text-zinc-400 print:hidden">
                +
                <input
                  key={round1(s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC)}
                  className="w-16 rounded border border-sky-900/60 bg-zinc-950 px-1.5 py-0.5 text-sky-100"
                  defaultValue={String(round1(s.wetModel?.deltaSec ?? DEFAULT_WET_DELTA_SEC))}
                  onBlur={(e) => setWetDelta(e.target.value)}
                  title={t.ev.fullWetHint}
                />
                {t.ev.perLap}
              </label>
              {s.wetModel && (
                <span className="text-zinc-500">
                  {s.wetModel.fromData ? t.ev.wetMeasured : t.ev.wetManual}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 uppercase tracking-wider text-zinc-500">
                {t.ev.halfWet}
                <Hint text={t.ev.halfWetHint} />
              </span>
              <label className="flex items-center gap-1 text-zinc-400 print:hidden">
                +
                <input
                  key={`half-${round1(halfWetDeltaSec(s))}`}
                  className="w-16 rounded border border-sky-900/40 bg-zinc-950 px-1.5 py-0.5 text-sky-100"
                  defaultValue={
                    s.wetModel?.manualHalfDeltaSec != null
                      ? String(round1(s.wetModel.manualHalfDeltaSec))
                      : ""
                  }
                  placeholder={String(round1(halfWetDeltaSec(s)))}
                  onBlur={(e) => setHalfWetDelta(e.target.value)}
                  title={t.ev.halfWetHint}
                />
                {t.ev.perLap}
              </label>
              <span className="text-zinc-500">
                {s.wetModel?.manualHalfDeltaSec != null
                  ? t.ev.halfYours
                  : t.ev.halfDefault(Math.round(DEFAULT_HALF_WET_FRACTION * 100))}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-24 uppercase tracking-wider text-zinc-500">
                {t.ev.traffic}
                <Hint text={t.ev.trafficHint} />
              </span>
              <label className="flex items-center gap-1 text-zinc-400 print:hidden">
                +
                <input
                  className="w-16 rounded border border-amber-900/60 bg-zinc-950 px-1.5 py-0.5 text-amber-100"
                  value={s.event.trafficPenaltySec}
                  onChange={(e) => patchEvent("trafficPenaltySec", e.target.value)}
                  placeholder="0"
                  title={t.ev.trafficHint}
                />
                {t.ev.perLap}
              </label>
              <span className="text-zinc-500">{t.ev.trafficNote}</span>
            </div>
            <p className="text-zinc-600">{t.ev.weatherNote}</p>
          </div>
      </div>
      </AdvancedOnly>

      {/* Fuel-save strategy optimizer */}
      <div className={card} id="card-fuelsave">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.fs.title}
            <GuideLink section="pace" />
          </h2>
          <button
            onClick={runFuelSaveOptimizer}
            title={t.fs.optimizeHint}
            className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 print:hidden"
          >
            {t.fs.optimize}
          </button>
        </div>
        {/* The targets lead, because they are the half a driver can act on:
            "hold 3.14 L/lap and the stint reaches 24 laps" is an instruction.
            The stop-count sweep below is the analysis behind it and folds away. */}
        <p className="mb-2 text-xs text-zinc-500">{t.jo.targetsLead}</p>
        {fsTargets.length === 0 ? (
          <p className="mb-3 text-xs text-zinc-500">{t.jo.targetsNone}</p>
        ) : (
          <div className="mb-3 overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2">{t.jo.colLapsPerStint}</th>
                  <th className="py-1 pr-2 text-right">{t.jo.colNeeds}</th>
                  <th className="py-1 pr-2 text-right">{t.jo.colSave}</th>
                  <th className="py-1 pr-2 text-right">{t.jo.colStops}</th>
                  <th className="py-1 pr-2" />
                </tr>
              </thead>
              <tbody>
                {fsTargets.map((r) => (
                  <tr
                    key={r.lapsPerStint}
                    className={`border-t border-zinc-800/60 ${
                      r.current
                        ? "text-zinc-200"
                        : r.reachable
                          ? "text-emerald-200"
                          : "text-zinc-500"
                    }`}
                  >
                    <td className="py-1 pr-2 font-medium">
                      {r.lapsPerStint}
                      {r.current && (
                        <span className="ml-1.5 text-[10px] uppercase text-zinc-500">
                          {t.jo.rowCurrent}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-2 text-right">{r.fuelPerLap.toFixed(2)} L</td>
                    <td className="py-1 pr-2 text-right">
                      {r.current
                        ? "—"
                        : `−${r.savePerLap.toFixed(2)} L (${r.savePct.toFixed(1)} %)`}
                    </td>
                    <td className="py-1 pr-2 text-right">{r.stops}</td>
                    <td className="py-1 pr-2 text-xs">
                      {r.current
                        ? ""
                        : !r.reachable
                          ? t.jo.unreachable
                          : t.jo.targetsSaves(
                              Math.max(0, fsTargets[0].stops - r.stops)
                            )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <details className="mb-3 print:hidden">
          <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
            {t.jo.analysisDetails}
          </summary>
          <p className="mt-2 text-xs text-zinc-500">{t.fs.lead}</p>
        </details>
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
            const byTime = fuelSaveOpt.lapLimited;
            // Timed race: more laps wins. Distance race: less time wins.
            const gain = byTime
              ? push.totalTimeSec - best.totalTimeSec
              : best.totalLaps - push.totalLaps;
            return (
              <div className="space-y-3">
                <div className="rounded border border-emerald-800/50 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
                  {t.fs.bestPre} <strong>{t.fs.bestStops(best.stops)}</strong>{" "}
                  {t.fs.bestTargetLap}{" "}
                  <strong>{fmtLap(best.laptimeSec)}</strong> {t.fs.bestFuelPre}{" "}
                  {best.fuelPerLap.toFixed(2)} {t.fs.bestFuelPost}{" "}
                  <strong>
                    {byTime
                      ? fmtDuration(best.totalTimeSec)
                      : t.fs.lapsValue(best.totalLaps.toFixed(1))}
                  </strong>
                  {fuelSaveOpt.bestIndex !== fuelSaveOpt.fullPushIndex
                    ? byTime
                      ? t.fs.gainTime(fmtDuration(Math.abs(gain)), gain > 0, push.stops)
                      : t.fs.gainLaps(
                          `${gain > 0 ? "+" : ""}${gain.toFixed(1)}`,
                          push.stops
                        )
                    : t.fs.fullPushOptimal}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm tabular-nums">
                    <thead className="text-zinc-500">
                      <tr className="border-b border-zinc-800">
                        <th className="py-1 pr-2">{t.fs.colStops}</th>
                        <th className="py-1 pr-2 text-right">{t.fs.colTargetLap}</th>
                        <th className="py-1 pr-2 text-right">{t.fs.colFuelPerLap}</th>
                        <th className="py-1 pr-2 text-right">{t.fs.colLapsPerStint}</th>
                        <th className="py-1 pr-2 text-right">
                          {byTime ? t.fs.colRaceTime : t.fs.colTotalLaps}
                        </th>
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
                              <span className="ml-1 text-[10px] uppercase text-emerald-400">
                                {t.fs.bestApplied}
                              </span>
                            )}
                          </td>
                          <td className="py-1 pr-2 text-right">{fmtLap(r.laptimeSec)}</td>
                          <td className="py-1 pr-2 text-right">{r.fuelPerLap.toFixed(2)} L</td>
                          <td className="py-1 pr-2 text-right">{r.lapsPerStint}</td>
                          <td className="py-1 pr-2 text-right">
                            {byTime ? fmtDuration(r.totalTimeSec) : r.totalLaps.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-[11px] text-zinc-600">
                  {t.fs.assumesPre}{" "}
                  {byTime ? t.fs.assumesTime : t.fs.assumesLaps}
                </p>
              </div>
            );
          })()}
      </div>

      </div>

      {/* ===== the same tab, second half: what each DRIVER runs. One box, so
          the totals strip appears once and a profile sits next to the driver
          figures it falls back to. ===== */}

      {/* Garage 61 import.
          Johann Solowej asked for an option to hide this whole section
          (Sept 2026) — which is what Easy mode is, so it goes behind it. */}
      <AdvancedOnly>
      <div className={card} id="card-g61">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.g61.title}
            <GuideLink section="pace" />
          </h2>
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {/* Fold the whole block away once the data is in. After a pull the
                numbers already sit in the plan's driver rows; the tables and
                charts below are a screen you scroll past on every later visit.
                Per device (localStorage), like language and Easy/Advanced. */}
            {(s.g61Analysis || g61) && (
              /* A span, not a button — see the pit-stop card: a completed plan
                 sits in a disabled fieldset, and folding is a view preference,
                 not part of the frozen data. */
              <span
                role="button"
                tabIndex={0}
                onClick={() => setG61Collapsed(!g61Collapsed)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setG61Collapsed(!g61Collapsed);
                  }
                }}
                className="cursor-pointer select-none rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                title={g61Collapsed ? t.g61.showHint : t.g61.hideHint}
              >
                {g61Collapsed ? t.g61.show : t.g61.hide}
              </span>
            )}
            {!g61Collapsed && (
              <>
            <select
              value={s.event.g61Age}
              onChange={(e) => patchEvent("g61Age", e.target.value)}
              title={t.g61.ageHint}
              className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-sm text-zinc-200 print:hidden"
            >
              <option value="-1">{t.g61.ageCurrent}</option>
              <option value="-2">{t.g61.agePrev}</option>
              <option value="30">{t.g61.age30}</option>
              <option value="60">{t.g61.age60}</option>
              <option value="90">{t.g61.age90}</option>
              <option value="">{t.g61.ageAll}</option>
            </select>
            <button
              onClick={onGarage61Pull}
              disabled={g61PullBusy || g61Busy}
              className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
              title={t.g61.pullHint}
            >
              {g61PullBusy ? t.g61.pulling : t.g61.pull}
            </button>
            <label className="cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              {g61Busy ? t.g61.reading : t.g61.upload}
              <input
                type="file"
                accept=".xlsx"
                multiple
                className="hidden"
                disabled={g61Busy || g61PullBusy}
                onChange={(e) => onGarage61Files(e.target.files)}
              />
            </label>
            {/* Add instead of replace. Off by default: an import that quietly
                inherited three-week-old laps would be worse than one that
                quietly threw them away — so this is asked for, not assumed. */}
            <label
              className={`flex cursor-pointer items-center gap-1.5 rounded border px-2.5 py-1.5 text-sm ${
                s.g61Cumulative
                  ? "border-emerald-700/70 bg-emerald-950/30 text-emerald-200"
                  : "border-zinc-700 bg-zinc-900 text-zinc-400"
              }`}
              title={t.g61.cumulativeHint}
            >
              <input
                type="checkbox"
                checked={s.g61Cumulative === true}
                onChange={(e) =>
                  setS((p) => ({ ...p, g61Cumulative: e.target.checked }))
                }
              />
              {t.g61.cumulative}
            </label>
            {/* Clearing is two clicks, and wiping the pace/fuel the import wrote
                into the driver table is a separate opt-in — by then those are
                the numbers the schedule is built on. */}
            {(s.g61Analysis || g61 || pitScan) &&
              (clearArmed ? (
                <span className="flex flex-wrap items-center gap-2 rounded border border-red-900/60 bg-red-950/20 px-2 py-1">
                  <span className="text-xs text-red-200">{t.g61.clearAsk}</span>
                  <label className="flex cursor-pointer items-center gap-1 text-[11px] text-zinc-300">
                    <input
                      type="checkbox"
                      checked={clearDriverFigures}
                      onChange={(e) => setClearDriverFigures(e.target.checked)}
                    />
                    {t.g61.clearAlsoFigures}
                  </label>
                  <button
                    onClick={() => clearGarage61(clearDriverFigures)}
                    className="rounded bg-red-800 px-2 py-1 text-xs font-semibold text-red-50 hover:bg-red-700"
                  >
                    {t.g61.clearYes}
                  </button>
                  <button
                    onClick={() => {
                      setClearArmed(false);
                      setClearDriverFigures(false);
                    }}
                    className="px-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    {t.g61.cancel}
                  </button>
                </span>
              ) : (
                <button
                  onClick={() => setClearArmed(true)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
                  title={t.g61.clearHint}
                >
                  {t.g61.clearBtn}
                </button>
              ))}
              </>
            )}
          </div>
        </div>
        {g61Collapsed ? (
          <p className="text-xs text-zinc-500">{t.g61.collapsedNote}</p>
        ) : (
          <>
        <p className="mb-3 text-xs text-zinc-500">
          <strong className="text-zinc-400">{t.g61.leadBold}</strong> {t.g61.leadMid}
          <strong className="text-zinc-400"> {t.g61.leadDrivers}</strong>{" "}
          {t.g61.leadMid2} <strong className="text-zinc-400">{t.g61.leadPit}</strong>
          {t.g61.leadPost}
        </p>

        {/* The lap pool: every import the plan's figures are computed from.
            Without this list, "add to existing data" would be a checkbox whose
            effect nobody can see — and a wet test session could sit in the
            median for weeks with no way to find it. */}
        {(s.g61Sources?.length ?? 0) > 0 && (
          <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/40 p-3 print:hidden">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-zinc-300">
                {t.g61.poolTitle(poolLapCount(s.g61Sources), s.g61Sources.length)}
              </span>
              <span className="text-[11px] text-zinc-500">
                {t.g61.poolNote(MAX_POOL_LAPS)}
              </span>
            </div>
            <ul className="space-y-1">
              {s.g61Sources.map((src) => {
                const sum = sourceSummary(src);
                return (
                  <li
                    key={src.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-zinc-800/80 bg-zinc-900/40 px-2 py-1 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wider ${
                          src.kind === "pull"
                            ? "bg-orange-950/60 text-orange-300"
                            : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {src.kind === "pull" ? t.g61.kindPull : t.g61.kindFile}
                      </span>
                      <span className="truncate text-zinc-200" title={src.label}>
                        {src.label}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-zinc-500">
                      <span className="tabular-nums">
                        {t.g61.sourceSummary(
                          sum.laps,
                          sum.drivers,
                          sum.oldestMs != null && sum.newestMs != null
                            ? ` · ${fmtDay(sum.oldestMs)}–${fmtDay(sum.newestMs)}`
                            : ""
                        )}
                      </span>
                      <span title={t.g61.importedOn(fmtDay(Date.parse(src.importedAt)))}>
                        {fmtDay(Date.parse(src.importedAt))}
                      </span>
                      <button
                        onClick={() => removeG61Source(src.id)}
                        className="rounded px-1 text-zinc-500 hover:bg-red-950/40 hover:text-red-300"
                        title={t.g61.removeSource}
                      >
                        ×
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Connection status + connect (per-plan token) */}
        <div className="mb-3 rounded border border-zinc-800 bg-zinc-950/40 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-zinc-400">
              {g61Status?.connected ? (
                <span className="text-emerald-300">
                  {t.g61.connected}
                  {g61Status.teamName
                    ? t.g61.connectedTeam(g61Status.teamName)
                    : t.g61.connectedNoTeam}
                </span>
              ) : g61Status?.globalFallback ? (
                <span className="text-zinc-400">{t.g61.sharedToken}</span>
              ) : (
                <span className="text-zinc-500">{t.g61.notConnected}</span>
              )}
            </span>
            {curId && viewerCanManage && (
              <div className="flex items-center gap-2 print:hidden">
                {g61Status?.connected && (
                  <button
                    onClick={onG61Disconnect}
                    disabled={g61ConnBusy}
                    className="rounded border border-red-900/60 px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 disabled:opacity-50"
                  >
                    {t.g61.disconnect}
                  </button>
                )}
                <button
                  onClick={() => setG61ShowConnect((v) => !v)}
                  className="rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  {g61Status?.connected ? t.g61.changeToken : t.g61.connectToken}
                </button>
              </div>
            )}
          </div>

          {!curId && (
            <p className="mt-2 text-[11px] text-zinc-500">{t.g61.saveFirst}</p>
          )}

          {curId && viewerCanManage && g61ShowConnect && (
            <div className="mt-3 space-y-2">
              <p className="text-[11px] text-zinc-500">
                {t.g61.tokenExplainPre}
                <strong>{t.g61.tokenExplainBold}</strong> {t.g61.tokenExplainPost}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="password"
                  className={`${inp} max-w-xs`}
                  value={g61Token}
                  onChange={(e) => setG61Token(e.target.value)}
                  placeholder={t.g61.tokenPlaceholder}
                  autoComplete="off"
                />
                <button
                  onClick={onG61Connect}
                  disabled={g61ConnBusy}
                  className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 disabled:opacity-50"
                >
                  {g61ConnBusy ? t.g61.connecting : t.g61.connect}
                </button>
              </div>
              {g61Teams.length > 1 && (
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-[11px] uppercase tracking-wider text-zinc-500">
                    {t.g61.team}
                  </label>
                  <select
                    className={`${inp} max-w-xs`}
                    value={g61Status?.teamSlug ?? ""}
                    onChange={(e) => onG61PickTeam(e.target.value)}
                    disabled={g61ConnBusy}
                  >
                    <option value="">{t.g61.selectTeam}</option>
                    {g61Teams.map((team) => (
                      <option key={team.slug} value={team.slug}>
                        {team.name}
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

        {/* The pull to review: the fresh one when there is one, otherwise the
            analysis saved with the plan. Gating this on the fresh pull alone
            meant a stored pull could be SEEN (the dashboard renders it) but
            never re-applied — you had to pull again just to undo a ↺ or to
            re-project the pace after changing the track temperature. */}
        {(() => {
          const pending = g61 ?? s.g61Analysis;
          return pending ? (
          <div className="space-y-3">
            {/* Not a second driver table — just what Apply would change in the
                one below, so the team can see the delta before committing. */}
            <div className="rounded border border-zinc-800 bg-zinc-950/60 p-3">
              <div className="mb-2 text-xs uppercase tracking-wide text-zinc-500">
                {t.g61.applyChangesTitle}
              </div>
              <ul className="space-y-1.5 text-sm">
                {pending.drivers.map((d) => {
                  const row = s.drivers.find(
                    (x) => x.name.trim().toLowerCase() === d.driver.trim().toLowerCase()
                  );
                  if (!row) {
                    return (
                      <li key={d.driver} className="text-zinc-500">
                        {t.g61.notOnRoster(d.driver, d.laps)}
                      </li>
                    );
                  }
                  const proj = g61Projection(pending);
                  const newPace = fmtLap(d.racePaceSec + proj);
                  const newFuel = d.fuelPerLap.toFixed(2);
                  const paceKept = !!row.manual?.laptime;
                  const fuelKept = !!row.manual?.fuelPerLap;
                  const arrow = (from: string, to: string, kept: boolean) =>
                    kept ? (
                      <span className="text-amber-300">{t.g61.kept(from)}</span>
                    ) : from === to || from === "" ? (
                      <span className="text-emerald-300">{to}</span>
                    ) : (
                      <>
                        <span className="text-zinc-500 line-through">{from}</span>{" "}
                        <span className="text-emerald-300">→ {to}</span>
                      </>
                    );
                  return (
                    <li key={d.driver} className="text-zinc-300">
                      <span className="text-zinc-100">{d.driver}</span>{" "}
                      <span className="text-zinc-600">{t.g61.cleanLaps(d.laps)}</span> ·{" "}
                      {t.g61.pace} {arrow(row.laptime, newPace, paceKept)} ·{" "}
                      {t.g61.fuelWord} {arrow(row.fuelPerLap ?? "", `${newFuel} L`, fuelKept)}
                    </li>
                  );
                })}
              </ul>
              {g61Projection(pending) !== 0 && (
                <p className="mt-2 text-[11px] text-zinc-500">
                  {t.g61.projectedNote(
                    `${g61Projection(pending) > 0 ? "+" : ""}${g61Projection(pending).toFixed(1)}`
                  )}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">
                {t.g61.standardSummary(
                  fmtLap(pending.overall.laptimeSec),
                  pending.overall.fuelPerLap.toFixed(2),
                  pending.overall.cleanLaps
                )}
                {pending.temp.sourceTempC != null && (
                  <>
                    {" · "}
                    {pending.temp.slopePerC != null
                      ? t.g61.tempFit(
                          (pending.temp.slopePerC * 10).toFixed(1),
                          pending.temp.minTempC?.toFixed(0) ?? "—",
                          pending.temp.maxTempC?.toFixed(0) ?? "—"
                        )
                      : t.g61.tempFlat(round1(pending.temp.sourceTempC))}
                  </>
                )}
              </span>
              <button
                onClick={() => applyGarage61(pending)}
                className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-orange-500 print:hidden"
              >
                {t.g61.applyToPlan}
              </button>
            </div>
          </div>
          ) : null;
        })()}
          </>
        )}
      </div>

      {/* Driver performance dashboard (from a Garage 61 pull/import) */}
      {(() => {
        const a = g61 ?? s.g61Analysis;
        return a && !g61Collapsed ? (
          <StintDriverStats
            analysis={a}
            rosterNames={s.drivers.map((d) => d.name)}
          />
        ) : null;
      })()}
      </AdvancedOnly>

      {/* Drivers */}
      <div className={card}>
        {/* No "add driver" field here any more — the line-up is built in the
            Roster card at the top, next to the fuel profiles, where you are
            when you set a race up. This table is for the numbers. */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.drv.title}
            <GuideLink section="pace" />
          </h2>
        </div>
        {s.drivers.length === 0 ? (
          <p className="text-sm text-zinc-500">
            {t.drv.emptyPre}{" "}
            <strong className="text-zinc-400">{t.drv.emptyRoster}</strong>{" "}
            {t.drv.emptyPost}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <p className="mb-2 text-xs text-zinc-500">
              {t.drv.leadPre}{" "}
              <strong className="text-zinc-400">{t.drv.leadPace}</strong>{" "}
              {t.drv.leadAnd}{" "}
              <strong className="text-zinc-400">{t.drv.leadFuel}</strong>{" "}
              {t.drv.leadMid} <em>{t.drv.leadPrefills}</em>
              {t.drv.leadMid2}{" "}
              <span className="text-emerald-300">{t.drv.leadGreen}</span>{" "}
              {t.drv.leadMid3}{" "}
              <span className="text-amber-200">{t.drv.leadAmber}</span> {t.drv.leadPost}
            </p>
            {/* One honest status line for the whole roster. An empty Pace or
                L/lap cell is easy to miss in a twelve-column table, and it
                quietly turns a stint into a guess — so name the drivers, and
                where Garage 61 already has the answer, offer the one click that
                fixes it instead of just complaining. */}
            {(() => {
              const assigned = new Set(
                s.assignments.map((a) => a.driverId).filter(Boolean) as string[]
              );
              const gaps = s.drivers.filter(
                (d) =>
                  assigned.has(d.id) && (!d.laptime.trim() || !d.fuelPerLap?.trim())
              );
              if (gaps.length === 0) return null;
              const pending = g61 ?? s.g61Analysis;
              const fixable = gaps.filter((d) => g61ByDriver.has(normName(d.name)));
              const manualOnly = gaps.filter((d) => !g61ByDriver.has(normName(d.name)));
              return (
                <div className="mb-2 rounded border border-amber-900/50 bg-amber-950/20 p-2.5 text-xs text-amber-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {t.drv.gapsPre} <strong>{t.drv.gapsBold}</strong>
                      {t.drv.gapsMid}{" "}
                      <strong>{gaps.map((d) => d.name).join(", ")}</strong>
                      {t.drv.gapsPost}{" "}
                      <span className="uppercase">{t.drv.gapsEst}</span>{" "}
                      {t.drv.gapsPost2}
                    </span>
                    {pending && fixable.length > 0 && (
                      <button
                        onClick={() => applyGarage61(pending)}
                        className="shrink-0 rounded bg-[#ff6b35] px-2.5 py-1 text-xs font-semibold text-zinc-950 hover:bg-orange-500 print:hidden"
                      >
                        {t.drv.applyG61To(fixable.length)}
                      </button>
                    )}
                  </div>
                  {pending && fixable.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-300/70">
                      {t.drv.fixableNote(fixable.map((d) => d.name).join(", "))}
                    </p>
                  )}
                  {manualOnly.length > 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-300/70">
                      {t.drv.manualOnlyNote(manualOnly.map((d) => d.name).join(", "))}
                    </p>
                  )}
                </div>
              );
            })()}
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-xs uppercase tracking-wide text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2">{t.drv.colDriver}</th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colLaps}
                    <Hint text={t.drv.colLapsHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colBest}
                    <Hint text={t.drv.colBestHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colAvg}
                    <Hint text={t.drv.colAvgHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colTemp}
                    <Hint text={t.drv.colTempHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colPace}
                    <Hint text={t.drv.colPaceHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colFuel}
                    <Hint text={t.drv.colFuelHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colWear}
                    <Hint text={t.drv.colWearHint} />
                  </th>
                  {/* An official race measures a driver against their own
                      rating, so the rating and the target it buys belong here
                      — not in a second place to type the same number. */}
                  {official && (
                    <>
                      <th className="py-1 pr-2 text-right text-cyan-300/80">
                        {t.jo.iRating}
                        <Hint text={t.jo.iRatingHint} />
                      </th>
                      {paceCurve && (
                        <th className="py-1 pr-2 text-right text-cyan-300/80">
                          {t.jo.colTarget}
                          <Hint text={t.jo.colTargetHint} />
                        </th>
                      )}
                    </>
                  )}
                  {/* Fine-tuning per driver: real, but four more columns on an
                      already wide table, so Advanced only. */}
                  {advanced && (
                    <>
                      <th className="py-1 pr-2 text-right">
                        {t.jo.colWet}
                        <Hint text={t.jo.colWetHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.jo.colHalfWet}
                        <Hint text={t.jo.colHalfWetHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.jo.colTraffic}
                        <Hint text={t.jo.colTrafficHint} />
                      </th>
                      <th className="py-1 pr-2 text-right">
                        {t.jo.colTempSlope}
                        <Hint text={t.jo.colTempSlopeHint} />
                      </th>
                    </>
                  )}
                  {s.savingEnabled && deltaSaving && (
                    <>
                      <th className="py-1 pr-2 text-right text-cyan-300/80">
                        {t.drv.colFsSec}
                        <Hint text={t.drv.colFsSecHint} />
                      </th>
                      <th className="py-1 pr-2 text-right text-cyan-300/80">
                        {t.drv.colFsFuel}
                        <Hint text={t.drv.colFsFuelHint} />
                      </th>
                    </>
                  )}
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colRange}
                    <Hint text={t.drv.colRangeHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colLapsTotal}
                    <Hint text={t.drv.colLapsTotalHint} />
                  </th>
                  <th className="py-1 pr-2 text-right">
                    {t.drv.colStints}
                    <Hint text={t.drv.colStintsHint} />
                  </th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {s.drivers.map((d) => {
                  const gd = g61ByDriver.get(normName(d.name)) ?? null;
                  const perf = driverPerf.rows.find((r) => r.id === d.id) ?? null;
                  // Colour the FIELD, not the driver. Green used to mean "this
                  // driver has Garage 61 data", which painted an EMPTY field
                  // green with the pulled figure sitting in it as a grey
                  // placeholder — indistinguishable from a filled one, and a
                  // plan can run a whole race weekend on the Standard profile
                  // that way. Green now means "there is a value in here".
                  const cell = (
                    manual: boolean | undefined,
                    value: string | undefined,
                    hasData: boolean
                  ) => {
                    const filled = !!value?.trim();
                    return `w-20 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                      !filled
                        ? hasData
                          ? "border-amber-600/60 text-zinc-100 placeholder:text-amber-300/50"
                          : "border-zinc-700 text-zinc-100"
                        : manual
                          ? "border-amber-700/70 text-amber-100"
                          : "border-emerald-900/60 text-emerald-100"
                    }`;
                  };
                  return (
                    <tr key={d.id} className="border-t border-zinc-800/60">
                      <td className="py-1 pr-2 text-zinc-100">
                        <span className={`mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle ${driverColour(d.id).dot}`} />
                        {d.name}
                      </td>
                      <td className="py-1 pr-2 text-right text-zinc-500">{gd?.laps ?? "—"}</td>
                      <td className="py-1 pr-2 text-right text-zinc-400">
                        {gd ? fmtLap(gd.bestSec) : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right text-zinc-400">
                        {gd ? fmtLap(gd.meanSec) : "—"}
                      </td>
                      <td
                        className="py-1 pr-2 text-right text-zinc-500"
                        title={
                          gd
                            ? t.drv.tempCellHint(
                                analysisTemp?.minTempC != null &&
                                  analysisTemp?.maxTempC != null
                                  ? t.drv.tempCellSpan(
                                      analysisTemp.minTempC.toFixed(0),
                                      analysisTemp.maxTempC.toFixed(0),
                                      analysisTemp.slopePerC != null
                                        ? t.drv.tempCellFit(
                                            (analysisTemp.slopePerC * 10).toFixed(1)
                                          )
                                        : ""
                                    )
                                  : ""
                              )
                            : undefined
                        }
                      >
                        {gd?.medianTempC != null
                          ? `${gd.medianTempC.toFixed(0)}°`
                          : analysisTemp?.sourceTempC != null
                            ? `~${round1(analysisTemp.sourceTempC)}°`
                            : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          className={cell(d.manual?.laptime, d.laptime, !!gd)}
                          value={d.laptime}
                          onChange={(e) => patchDriverLaptime(d.id, e.target.value)}
                          placeholder={gd ? fmtLap(gd.racePaceSec) : "m:ss"}
                          title={
                            d.manual?.laptime ? t.drv.ownFigure : t.drv.fromG61Pace
                          }
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">{d.laptime || "—"}</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          className={cell(d.manual?.fuelPerLap, d.fuelPerLap, !!gd)}
                          value={d.fuelPerLap ?? ""}
                          onChange={(e) => patchDriverField(d.id, "fuelPerLap", e.target.value)}
                          placeholder={gd ? gd.fuelPerLap.toFixed(2) : "L"}
                          title={
                            d.manual?.fuelPerLap ? t.drv.ownFigure : t.drv.fromG61Fuel
                          }
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">{d.fuelPerLap || "—"}</td>
                      <td className="py-1 pr-2 text-right print:hidden">
                        <input
                          className={cell(d.manual?.tyreWear, d.tyreWear, false)}
                          value={d.tyreWear ?? ""}
                          onChange={(e) => patchDriverField(d.id, "tyreWear", e.target.value)}
                          placeholder={s.event.tyreWearPctPerLap || "%"}
                          title={t.drv.wearHint}
                        />
                      </td>
                      <td className="hidden py-1 pr-2 text-right print:table-cell">{d.tyreWear || "—"}</td>
                      {official && (
                        <>
                          <td className="py-1 pr-2 text-right print:hidden">
                            <input
                              className={`w-20 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                                d.iRating?.trim()
                                  ? "border-cyan-800/70 text-cyan-100"
                                  : "border-zinc-700 text-zinc-100"
                              }`}
                              value={d.iRating ?? ""}
                              onChange={(e) =>
                                patchDriverPlain(d.id, "iRating", e.target.value)
                              }
                              placeholder={t.jo.iRatingPlaceholder}
                              title={t.jo.iRatingHint}
                            />
                          </td>
                          <td className="hidden py-1 pr-2 text-right print:table-cell">
                            {d.iRating || "—"}
                          </td>
                          {paceCurve && (
                            <td
                              className="py-1 pr-2 text-right tabular-nums text-cyan-300"
                              title={t.jo.colTargetHint}
                            >
                              {(() => {
                                const ir = parseTypedNumber(d.iRating ?? "");
                                if (!(ir > 0)) return "—";
                                const target = targetLapSec(paceCurve.points, ir);
                                return target ? fmtPaceSec(target.sec) : "—";
                              })()}
                            </td>
                          )}
                        </>
                      )}
                      {advanced && (
                        <>
                          {(
                            [
                              ["wetSec", d.wetSec, t.jo.colWetHint,
                                round1(wetDeltaSecOf(s)).toFixed(1)],
                              ["halfWetSec", d.halfWetSec, t.jo.colHalfWetHint,
                                round1(halfWetDeltaSec(s)).toFixed(1)],
                              ["trafficSec", d.trafficSec, t.jo.colTrafficHint,
                                s.event.trafficPenaltySec || "0"],
                              ["tempSlopePer10", d.tempSlopePer10, t.jo.colTempSlopeHint,
                                round1((s.tempModel?.slopePerC ?? 0) * 10).toFixed(1)],
                            ] as const
                          ).map(([key, value, hint, placeholder]) => (
                            <td key={key} className="py-1 pr-2 text-right print:hidden">
                              <input
                                className={`w-16 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                                  value?.trim()
                                    ? "border-sky-800/70 text-sky-100"
                                    : "border-zinc-700 text-zinc-100"
                                }`}
                                value={value ?? ""}
                                onChange={(e) =>
                                  patchDriverPlain(d.id, key, e.target.value)
                                }
                                placeholder={placeholder}
                                title={hint}
                              />
                            </td>
                          ))}
                        </>
                      )}
                      {s.savingEnabled && deltaSaving && (
                        <>
                          <td className="py-1 pr-2 text-right print:hidden">
                            <input
                              className={`w-16 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                                d.savingSec?.trim()
                                  ? "border-cyan-800/70 text-cyan-100"
                                  : "border-zinc-700 text-zinc-100"
                              }`}
                              value={d.savingSec ?? ""}
                              onChange={(e) => patchDriverSaving(d.id, "savingSec", e.target.value)}
                              placeholder={planDelta.sec ? planDelta.sec.toFixed(1) : "s"}
                              title={t.drv.fsSecCellHint}
                            />
                          </td>
                          <td className="hidden py-1 pr-2 text-right print:table-cell">
                            {d.savingSec || (planDelta.sec ? planDelta.sec.toFixed(1) : "—")}
                          </td>
                          <td className="py-1 pr-2 text-right print:hidden">
                            <input
                              className={`w-16 rounded border bg-zinc-950 px-1.5 py-1 text-right text-sm ${
                                d.savingFuel?.trim()
                                  ? "border-cyan-800/70 text-cyan-100"
                                  : "border-zinc-700 text-zinc-100"
                              }`}
                              value={d.savingFuel ?? ""}
                              onChange={(e) => patchDriverSaving(d.id, "savingFuel", e.target.value)}
                              placeholder={planDelta.litres ? planDelta.litres.toFixed(2) : "L"}
                              title={t.drv.fsFuelCellHint}
                            />
                          </td>
                          <td className="hidden py-1 pr-2 text-right print:table-cell">
                            {d.savingFuel || (planDelta.litres ? planDelta.litres.toFixed(2) : "—")}
                          </td>
                        </>
                      )}
                      <td className="py-1 pr-2 text-right text-zinc-300">
                        {perf && perf.lapsPerStint > 0 ? (
                          <>
                            {perf.lapsPerStint}
                            <span className="ml-1 text-zinc-500">{fmtDuration(perf.rangeSec)}</span>
                          </>
                        ) : (
                          <span className="text-zinc-600">—</span>
                        )}
                      </td>
                      <td
                        className={`py-1 pr-2 text-right ${
                          perf && perf.laps > 0 && driverPerf.evenShare > 0 &&
                          perf.laps < driverPerf.evenShare * 0.85
                            ? "text-amber-300"
                            : "text-zinc-300"
                        }`}
                        title={
                          driverPerf.evenShare > 0
                            ? t.drv.evenShareHint(driverPerf.evenShare)
                            : undefined
                        }
                      >
                        {perf?.laps ? fmtLaps(perf.laps) : "—"}
                      </td>
                      <td className="py-1 pr-2 text-right text-zinc-300">{perf?.stints || "—"}</td>
                      <td className="py-1 text-right print:hidden">
                        {(d.manual?.laptime || d.manual?.fuelPerLap || d.manual?.tyreWear) && (
                          <button
                            onClick={() => {
                              resetDriverField(d.id, "laptime");
                              resetDriverField(d.id, "fuelPerLap");
                              resetDriverField(d.id, "tyreWear");
                            }}
                            className="mr-1 rounded border border-zinc-700 px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-800"
                            title={t.drv.resetHint}
                          >
                            ↺
                          </button>
                        )}
                        <button
                          onClick={() => removeDriver(d.id)}
                          className="rounded border border-red-900/60 px-2 py-1 text-sm text-red-300 hover:bg-red-950/40"
                          aria-label={t.drv.removeDriver}
                          title={t.drv.removeDriver}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {driverPerf.rows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-zinc-700 text-zinc-400">
                    <td className="py-1 pr-2 font-medium text-zinc-300">{t.drv.teamRow}</td>
                    <td className="py-1 pr-2 text-right" />
                    <td className="py-1 pr-2 text-right" />
                    <td className="py-1 pr-2 text-right" />
                    <td className="py-1 pr-2 text-right" />
                    <td className="py-1 pr-2 text-right" title={t.drv.weightedHint}>
                      {driverPerf.avg.paceSec > 0 ? fmtLap(driverPerf.avg.paceSec) : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {driverPerf.avg.fuelPerLap > 0 ? driverPerf.avg.fuelPerLap.toFixed(2) : "—"}
                    </td>
                    <td className="py-1 pr-2 text-right">
                      {driverPerf.avg.wear > 0 ? driverPerf.avg.wear.toFixed(2) : "—"}
                    </td>
                    {/* The team row has nothing to say about a rating, a target
                        or a per-driver delta — but the cells have to be there
                        or every column after them shifts. */}
                    {official && (
                      <>
                        <td className="py-1 pr-2 text-right" />
                        {paceCurve && <td className="py-1 pr-2 text-right" />}
                      </>
                    )}
                    {advanced && (
                      <>
                        <td className="py-1 pr-2 text-right" />
                        <td className="py-1 pr-2 text-right" />
                        <td className="py-1 pr-2 text-right" />
                        <td className="py-1 pr-2 text-right" />
                      </>
                    )}
                    {s.savingEnabled && deltaSaving && (
                      <>
                        <td className="py-1 pr-2 text-right" />
                        <td className="py-1 pr-2 text-right" />
                      </>
                    )}
                    <td className="py-1 pr-2 text-right" />
                    <td className="py-1 pr-2 text-right font-medium text-zinc-200">
                      {fmtLaps(driverPerf.avg.laps)}
                    </td>
                    <td className="py-1 pr-2 text-right font-medium text-zinc-200">
                      {driverPerf.avg.stints}
                    </td>
                    <td className="py-1" />
                  </tr>
                </tfoot>
              )}
            </table>
            {/* Tyre wear is a per-driver figure — it used to sit in the
                pit-stop model, where it read as if a session export measured
                it. Nothing measures it; it belongs next to the column it
                fills. */}
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-zinc-950/40 p-2.5 print:hidden">
              <label className="flex items-center text-[11px] uppercase tracking-wider text-zinc-500">
                {t.drv.defaultWear}
                <Hint text={t.drv.defaultWearNote} />
              </label>
              <input
                className="w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-1 text-right text-sm text-zinc-100"
                value={s.event.tyreWearPctPerLap}
                onChange={(e) => patchEvent("tyreWearPctPerLap", e.target.value)}
                placeholder={t.drv.defaultWearPlaceholder}
              />
              <span className="text-[11px] text-zinc-500">{t.drv.defaultWearNote}</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
              {s.g61Analysis && (
                <span className="text-emerald-300/80">
                  {t.drv.dataPrefix}{" "}
                  {s.g61Analysis.source?.kind === "upload"
                    ? t.drv.dataSessionExport
                    : t.drv.dataG61(s.g61Analysis.source?.window ?? "")}
                  {s.g61Analysis.source?.oldestLapMs != null &&
                  s.g61Analysis.source?.newestLapMs != null
                    ? ` · ${fmtDay(s.g61Analysis.source.oldestLapMs)}–${fmtDay(s.g61Analysis.source.newestLapMs)}`
                    : ""}
                  {" · "}
                  {t.drv.dataCleanLaps(s.g61Analysis.overall.cleanLaps)}
                  {s.g61Analysis.source?.lapsTooOld
                    ? t.drv.dataTooOld(s.g61Analysis.source.lapsTooOld)
                    : ""}
                  {t.drv.dataPulled(fmtDay(Date.parse(s.g61Analysis.generatedAt)))}
                </span>
              )}
              <span>
                {t.drv.evenSharePre}{" "}
                <strong className="text-zinc-300">
                  {t.drv.evenShareValue(driverPerf.evenShare)}
                </strong>{" "}
                {t.drv.evenSharePost}
              </span>
              {driverPerf.traffic > 0 && (
                <span className="text-amber-300/80">
                  {t.drv.trafficNote(driverPerf.traffic)}
                </span>
              )}
              {s.event.trackTempC.trim() !== "" && (
                <span>
                  {t.drv.paceAt(
                    s.event.trackTempC,
                    s.tempModel?.slopePerC
                      ? t.drv.paceFit((s.tempModel.slopePerC * 10).toFixed(1))
                      : ""
                  )}
                </span>
              )}
            </div>
          </div>
        )}
        <p className="mt-2 text-xs text-zinc-500">{t.drv.footer}</p>
      </div>

      {/* Availability */}
      {s.drivers.length > 0 && hourCount > 0 && (
        <div className={card}>
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.avail.title}
            <GuideLink section="stints" />
          </h2>
          <p className="mb-2 text-xs text-zinc-500">{t.avail.lead1}</p>
          <p className="mb-3 text-xs text-zinc-500">
            {t.avail.lead2Pre} <em>{t.avail.lead2Em}</em> {t.avail.lead2Mid}{" "}
            <strong className="text-zinc-400">{t.avail.lead2Bold}</strong>{" "}
            {t.avail.lead2Post}
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-400 print:hidden">
            <span>{t.avail.nightFrom}</span>
            <input
              type="number"
              min={0}
              max={23}
              value={s.event.nightFromHour}
              onChange={(e) => patchEvent("nightFromHour", e.target.value)}
              className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right text-sm text-zinc-100"
            />
            <span>{t.avail.nightTo}</span>
            <input
              type="number"
              min={0}
              max={23}
              value={s.event.nightToHour}
              onChange={(e) => patchEvent("nightToHour", e.target.value)}
              className="w-16 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right text-sm text-zinc-100"
            />
            <span className="text-zinc-500">
              {t.avail.nightNote}
              {s.event.sessionStartLocal.trim() === "" && (
                <span className="ml-1 text-amber-400">{t.avail.nightNoStart}</span>
              )}
            </span>
          </div>
          {/* Same family as the night window and the per-driver answers below:
              all three tell the automatic line-up how to divide the race. */}
          <div className="mb-3 print:hidden">
            <CheckField
              checked={s.event.fairShare !== false}
              onChange={(v) => patchEvent("fairShare", v)}
              label={t.jo.fairShare}
              hint={t.jo.fairShareHint}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-3">{t.avail.colDriver}</th>
                  {Array.from({ length: hourCount }, (_, h) => (
                    <th
                      key={h}
                      className="px-1.5 py-1 text-center font-normal"
                      title={t.avail.hourLabel(h + 1)}
                    >
                      {t.avail.hourShort(h + 1)}
                    </th>
                  ))}
                  <th className="border-l border-zinc-800 px-2 py-1 font-normal">
                    {t.avail.colNight}
                    <Hint text={t.avail.colNightHint} />
                  </th>
                  <th className="px-2 py-1 font-normal">
                    {t.avail.colRain}
                    <Hint text={t.avail.colRainHint} />
                  </th>
                  <th className="px-2 py-1 font-normal">
                    {t.avail.colStart}
                    <Hint text={t.avail.colStartHint} />
                  </th>
                  <th className="px-2 py-1 font-normal">
                    {t.jo.colDouble}
                    <Hint text={t.jo.colDoubleHint} />
                  </th>
                  <th className="px-2 py-1 font-normal">
                    {t.jo.colTriple}
                    <Hint text={t.jo.colTripleHint} />
                  </th>
                  {/* The single old limit only still matters to a plan that was
                      signed off with one — otherwise it is noise beside the two
                      columns that replaced it. */}
                  {showLegacyMaxRow && (
                    <th className="px-2 py-1 text-right font-normal">
                      {t.jo.maxRowLegacy}
                      <Hint text={t.jo.maxRowLegacyHint} />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {s.drivers.map((d) => (
                  <tr key={d.id} className="border-t border-zinc-800/60">
                    <td className="py-1 pr-3 whitespace-nowrap text-zinc-200">
                      <span className={`mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle ${driverColour(d.id).dot}`} />
                      {d.name}
                    </td>
                    {Array.from({ length: hourCount }, (_, h) => (
                      <td key={h} className="px-1.5 py-1 text-center">
                        <input
                          type="checkbox"
                          checked={!isBlocked(d.id, h)}
                          onChange={() => toggleAvail(d.id, h)}
                          title={t.avail.availCell(d.name, h + 1)}
                        />
                      </td>
                    ))}
                    <td className="border-l border-zinc-800 px-2 py-1">
                      {prefSelect(d.id, "prefNight", d.prefNight, t.avail.prefNight)}
                    </td>
                    <td className="px-2 py-1">
                      {prefSelect(d.id, "prefRain", d.prefRain, t.avail.prefRain)}
                    </td>
                    <td className="px-2 py-1">
                      {prefSelect(d.id, "prefStart", d.prefStart, t.avail.prefStart)}
                    </td>
                    <td className="px-2 py-1">
                      {runPrefSelect(d.id, "prefDouble", d.prefDouble, t.jo.colDoubleHint)}
                    </td>
                    <td className="px-2 py-1">
                      {runPrefSelect(d.id, "prefTriple", d.prefTriple, t.jo.colTripleHint)}
                    </td>
                    {showLegacyMaxRow && (
                      <td className="px-2 py-1 text-right">
                        <input
                          type="number"
                          min={1}
                          max={12}
                          value={d.maxConsecutive ?? ""}
                          placeholder="—"
                          onChange={(e) => patchDriverPref(d.id, { maxConsecutive: e.target.value })}
                          title={t.avail.maxRowHint(d.name)}
                          className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-right text-sm text-zinc-100"
                        />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* What the automatic line-up had to give up. A fill that quietly
              breaks a promise is worse than no preferences at all. */}
          {fillReport && (
            <div className="mt-3 rounded border border-zinc-800 bg-zinc-950/40 p-3 text-xs">
              <div className="mb-2 font-semibold text-zinc-300">
                {t.avail.fillTitle(
                  fillReport.perDriver.length,
                  fillReport.fairShare.toFixed(1)
                )}
                {fillReport.perDriver.every((r) => r.broken.length === 0) && (
                  <span className="ml-2 text-emerald-300">
                    {t.avail.fillAllHonoured}
                  </span>
                )}
              </div>
              <ul className="space-y-1">
                {fillReport.perDriver.map((r) => (
                  <li key={r.driverId} className="flex flex-wrap items-baseline gap-x-3">
                    <span className="text-zinc-200">
                      <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${driverColour(r.driverId).dot}`} />
                      {r.name}
                    </span>
                    <span className="tabular-nums text-zinc-500">
                      {t.avail.fillStints(r.stints)}
                      {r.longestRun > 1 ? t.avail.fillLongestRun(r.longestRun) : ""}
                      {r.nightStints > 0 ? t.avail.fillNight(r.nightStints) : ""}
                      {r.rainStints > 0 ? t.avail.fillRain(r.rainStints) : ""}
                      {r.takesStart ? t.avail.fillTakesStart : ""}
                    </span>
                    {r.broken.length > 0 && (
                      <span className="text-amber-300">
                        {t.avail.fillBroken(r.broken.map(brokenWishText).join(", "))}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
              {fillReport.unavailableUsed.length > 0 && (
                <p className="mt-2 text-amber-300">
                  {t.avail.fillUnavailable(
                    fillReport.unavailableUsed.length,
                    fillReport.unavailableUsed.map((i) => i + 1).join(", ")
                  )}
                </p>
              )}
              {fillReport.unfilled.length > 0 && (
                <p className="mt-1 text-red-300">
                  {t.avail.fillUnfilled(fillReport.unfilled.map((i) => i + 1).join(", "))}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* The same schedule as during the race — this is what the event is
          planned around. Hidden on print so the During-Race copy is the only
          one on paper (every phase prints). Notes are a live-race field, so
          the column is dropped here. */}
      {result.stints.length > 0 && (
        <div className="print:hidden">{scheduleCard({ showNote: false })}</div>
      )}

      {/* Pre-Race notes */}
      <NotesField
        label={t.live.notesPre}
        value={s.notes["pre"]}
        onChange={(v) => patchNote("pre", v)}
      />
      </fieldset>
      </div>
      {/* ===== DURING ===== */}
      <div className={tabBox("during")}>
      <fieldset disabled={frozen} className="contents">
      {/* The green flag, on the tab the race is actually run from. Re-stamping
          is the normal case, not an edge case: races go green late, get red
          flagged, or the plan is opened after the start — and that used to
          mean switching back to the first tab mid-race. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 print:hidden">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
          {t.live.greenFlagLabel}
        </span>
        <span className="text-sm tabular-nums text-zinc-200">
          {s.event.sessionStartLocal ? (
            s.event.sessionStartLocal.replace("T", " ")
          ) : (
            <span className="text-amber-300">{t.live.greenFlagNotStamped}</span>
          )}
        </span>
        <button
          type="button"
          onClick={setRaceStartNow}
          title={t.ev.nowHint}
          className="shrink-0 rounded border border-emerald-800/60 bg-emerald-950/40 px-2.5 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/40"
        >
          {t.ev.now}
        </button>
        <span className="text-[11px] text-zinc-500">{t.live.greenFlagPress}</span>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label={t.live.stints} value={String(result.totals.stintCount)} />
        <Stat label={t.live.pitStops} value={String(result.totals.pitStops)} />
        <Stat label={t.live.totalLaps} value={fmtLaps(result.totals.laps)} />
        <Stat label={t.live.totalFuel} value={`${fmtFuel(result.totals.fuel)} L`} />
        <Stat label={t.live.drivers} value={String(result.totals.driverCount)} />
        <Stat
          label={t.live.projectedFinish}
          value={lastStint ? fmtDuration(lastStint.endSec) : "—"}
        />
      </div>
      {lastStint && (
        <p className="-mt-2 text-xs text-zinc-500">
          {t.live.fairShare(String(result.fairShareStints ?? "—"))}
        </p>
      )}

      {/* Live "now" banner */}
      {raceLive && result.raceStartUtcMs != null && lastStint && (
        <div className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 px-4 py-3 text-sm">
          {now < result.raceStartUtcMs ? (
            <span className="text-emerald-300">
              {t.live.greenFlagIn}{" "}
              <span className="font-semibold tabular-nums">
                {fmtCountdown(result.raceStartUtcMs - now)}
              </span>
            </span>
          ) : lastStint.wallEndMs != null && now >= lastStint.wallEndMs ? (
            <span className="text-zinc-400">{t.live.raceFinished}</span>
          ) : currentStint ? (
            <span className="text-emerald-300">
              {t.live.liveStint(currentStint.index, currentStint.driverName ?? "")}{" "}
              <span className="font-semibold tabular-nums">
                {fmtCountdown((currentStint.wallEndMs ?? now) - now)}
              </span>
              {currentStint.wallEndMs != null &&
                ` (${fmtClock(currentStint.wallEndMs)})`}
            </span>
          ) : (
            <span className="text-emerald-300">{t.live.liveOnly}</span>
          )}
        </div>
      )}

      {/* Schedule / pit timeline */}
      {scheduleCard({ showNote: true })}

      {/* Per-driver totals */}
      {result.perDriver.length > 0 && (
        <div className={card}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.totals.title}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm tabular-nums">
              <thead className="text-zinc-500">
                <tr className="border-b border-zinc-800">
                  <th className="py-1 pr-2">{t.totals.colDriver}</th>
                  <th className="py-1 pr-2 text-right">{t.totals.colStints}</th>
                  <th className="py-1 pr-2 text-right">{t.totals.colDriveTime}</th>
                  <th className="py-1 pr-2 text-right">{t.totals.colLaps}</th>
                  <th className="py-1 pr-2 text-right">{t.totals.colFuel}</th>
                </tr>
              </thead>
              <tbody>
                {result.perDriver.map((d) => (
                  <tr key={d.driverId} className="border-t border-zinc-800/60 text-zinc-200">
                    <td className="py-1 pr-2">
                      <span className={`mr-2 inline-block h-2.5 w-2.5 shrink-0 rounded-full align-middle ${driverColour(d.driverId).dot}`} />
                      {d.name}
                    </td>
                    <td className="py-1 pr-2 text-right">{d.stints}</td>
                    <td className="py-1 pr-2 text-right">{fmtDuration(d.driveSec)}</td>
                    <td
                      className={`py-1 pr-2 text-right ${
                        fairShareMin == null
                          ? ""
                          : d.laps < fairShareMin.min
                            ? "font-semibold text-amber-300"
                            : "text-emerald-300"
                      }`}
                      title={
                        fairShareMin == null
                          ? undefined
                          : d.laps < fairShareMin.min
                            ? t.jo.fairShareLow(Math.round(d.laps), fairShareMin.min)
                            : t.jo.fairShareOk(Math.round(d.laps))
                      }
                    >
                      {fmtLaps(d.laps)}
                    </td>
                    <td className="py-1 pr-2 text-right">{fmtFuel(d.fuel)} L</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {fairShareMin != null && (
            <p className="mt-2 text-[11px] text-zinc-500">
              {t.jo.fairShareMinNote(fairShareMin.min, fairShareMin.even)}
            </p>
          )}
        </div>
      )}

      {/* During-Race notes */}
      <NotesField
        label={t.live.notesDuring}
        value={s.notes["during"]}
        onChange={(v) => patchNote("during", v)}
      />
      </fieldset>
      </div>
      {/* ===== POST ===== */}
      <div className={tabBox("post")}>
      {/* Poster & impressions — the team's memory of the race */}
      <div className={card}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-orange-300">
          {t.post.galleryTitle}
        </h2>
        {galleryError && (
          <p className="mb-3 rounded border border-red-800/60 bg-red-950/40 px-3 py-2 text-sm text-red-200">
            {galleryError}
          </p>
        )}
        <RaceGallery
          poster={s.poster}
          impressions={s.impressions}
          busy={galleryBusy}
          max={MAX_IMPRESSIONS}
          onPickPoster={(files) => uploadImages(files, "poster")}
          onPickImpressions={(files) => uploadImages(files, "impression")}
          onRemovePoster={() => setS((p) => ({ ...p, poster: null }))}
          onRemoveImpression={removeImpression}
          onCaption={setImageCaption}
        />
      </div>

      {/* Race-logger JSONL: what the car actually did */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.post.logTitle}
            <GuideLink section="danach" />
          </h2>
          <label className="print:hidden cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            {uploadingLog
              ? t.post.logParsing
              : s.raceLog
                ? t.post.logReplace
                : t.post.logUpload}
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
            {t.post.logEmptyPre} <span className="font-mono">.jsonl</span>{" "}
            {t.post.logEmptyPost}
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
                  s.raceLog.ownCarNumber
                    ? t.post.logCarNumber(s.raceLog.ownCarNumber)
                    : null,
                  s.raceLog.ownCarClass,
                  s.raceLog.trackTempC != null
                    ? t.post.logTrackTemp(s.raceLog.trackTempC)
                    : null,
                  s.raceLog.classBestSec != null
                    ? t.post.logClassBest(fmtSec(s.raceLog.classBestSec))
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
                  {t.post.logUsePace}
                </button>
                {s.raceLog.trackTempC != null && (
                  <button
                    onClick={applyLogTrackTemp}
                    className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                  >
                    {t.post.logUseTemp}
                  </button>
                )}
                <button
                  onClick={removeRaceLog}
                  className="text-xs text-red-300/80 hover:text-red-200"
                >
                  {t.post.logRemove}
                </button>
              </div>
            </div>

            {s.raceLog.stints.length > 0 &&
              (s.eventResult?.ownDrivers?.length ?? 0) === 0 &&
              s.eventResult != null && (
                <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                  {t.post.logOldEventResultPre}{" "}
                  <span className="font-mono">eventresult.json</span>{" "}
                  {t.post.logOldEventResultPost}
                </p>
              )}
            {raceLogNeedsReparse && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                <span>
                  {raceLogNoTimestamps ? t.post.logNoTimestamps : t.post.logOldAverage}
                </span>
                <button
                  onClick={reanalyseRaceLog}
                  disabled={uploadingLog}
                  className="print:hidden shrink-0 rounded bg-amber-500 px-3 py-1 font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  {uploadingLog ? t.post.logReanalysing : t.post.logReanalyse}
                </button>
              </div>
            )}
            {s.raceLog.stints.length > 0 && s.eventResult == null && (
              <p className="rounded border border-amber-800/60 bg-amber-950/30 px-3 py-2 text-xs text-amber-200">
                {t.post.logNeedEventResultPre}{" "}
                <span className="font-mono">eventresult.json</span>{" "}
                {t.post.logNeedEventResultPost}
              </p>
            )}
            <RaceLogDashboard
              log={s.raceLog}
              teamDrivers={s.eventResult?.ownDrivers}
              planStints={result.stints.map((st) => ({
                startSec: st.startSec,
                endSec: st.endSec,
                driverName: st.driverName,
                trackTempC: st.trackTempC,
              }))}
              official={official}
              paceCurve={paceCurve?.points ?? null}
              refLapSec={refLapSec}
              // MEASURED slope only. The planner falls back to 0.1 s/°C for
              // its own stint maths, but a debrief number built on a
              // placeholder would read as measurement — so pass null and the
              // dashboard simply does not offer the corrected average.
              stintDriverOverrides={s.raceLog.stintDrivers ?? []}
              onStintDriverChange={(i, name) =>
                setS((p) => {
                  if (!p.raceLog) return p;
                  const next = [...(p.raceLog.stintDrivers ?? [])];
                  while (next.length <= i) next.push(null);
                  next[i] = name;
                  // All-null means nobody corrected anything — drop the array
                  // rather than saving a row of holes into every plan.
                  const any = next.some((n) => n);
                  return {
                    ...p,
                    raceLog: {
                      ...p.raceLog,
                      stintDrivers: any ? next : undefined,
                    },
                  };
                })
              }
              tempSlopePerC={s.tempModel?.slopePerC ?? null}
              baseTempC={
                s.event.trackTempC.trim() !== "" &&
                Number.isFinite(Number(s.event.trackTempC))
                  ? Number(s.event.trackTempC)
                  : null
              }
            />

          </div>
        )}
      </div>
      {/* End-of-session eventresult */}
      <div className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-orange-300">
            {t.post.resultTitle}
            <GuideLink section="danach" />
          </h2>
          <label className="print:hidden cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
            {uploadingResult
              ? t.post.resultParsing
              : s.eventResult
                ? t.post.resultReplace
                : t.post.resultUpload}
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
            {t.post.resultEmptyPre}{" "}
            <span className="font-mono">eventresult.json</span>{" "}
            {t.post.resultEmptyPost}
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
                {t.post.resultRemove}
              </button>
            </div>
            {s.eventResult.summary.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm tabular-nums">
                  <thead className="text-zinc-500">
                    <tr className="border-b border-zinc-800">
                      <th className="py-1 pr-2">{t.post.colPos}</th>
                      {resultHasClasses && (
                        <>
                          <th className="py-1 pr-2">{t.post.colClass}</th>
                          <th className="py-1 pr-2">{t.post.colClassPos}</th>
                        </>
                      )}
                      <th className="py-1 pr-2">{t.post.colNumber}</th>
                      <th className="py-1 pr-2">
                        {resultIsTeamEvent ? t.post.colTeam : t.post.colDriver}
                      </th>
                      <th className="py-1 pr-2">{t.post.colCar}</th>
                      <th className="py-1 pr-2 text-right">{t.post.colLaps}</th>
                      <th className="py-1 pr-2 text-right">{t.post.colBest}</th>
                      <th className="py-1 pr-2 text-right">{t.post.colInc}</th>
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
                    {t.post.showAll(s.eventResult.summary.length)}
                  </button>
                ) : (
                  s.eventResult.summary.length > 12 && (
                    <button
                      onClick={() => setShowAllResults(false)}
                      className="print:hidden mt-2 text-xs text-zinc-400 underline hover:text-zinc-300"
                    >
                      {t.post.showOurClass}
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Post-Race notes */}
      <NotesField
        label={t.live.notesPost}
        value={s.notes["post"]}
        onChange={(v) => patchNote("post", v)}
      />
      </div>
    </div>
    </>
  );
}

// ---- Small presentational helpers ----------------------------------------

/** Fold accents so "Grosse" finds "Große" and "Muller" finds "Müller". */
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
  const t = useT();
  return (
    <div className="rounded border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">
        {title}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t.fuel.lapTime} hint={t.fuel.lapTimeHint}>
          <input className={inp} value={laptime}
            onChange={(e) => onLaptime(e.target.value)} />
        </Field>
        <Field label={t.fuel.fuelPerLap} hint={t.fuel.fuelPerLapHint}>
          <input className={inp} value={fuelPerLap}
            onChange={(e) => onFuel(e.target.value)} />
        </Field>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
        <span><span className="text-zinc-500">{t.fuel.lapsPerStint}</span> {laps}</span>
        <span><span className="text-zinc-500">{t.fuel.onTrack}</span> {fmtDuration(green)}</span>
        <span><span className="text-zinc-500">{t.fuel.plusPit}</span> {fmtDuration(total)}</span>
        <span><span className="text-zinc-500">{t.fuel.fuelPerStint}</span> {fuel.toFixed(1)} L</span>
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
