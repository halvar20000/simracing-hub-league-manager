// Who drives which stint — the automatic line-up.
//
// The old auto-fill dealt the stints out round-robin (or in pairs) and stopped
// there. On a six-hour race that is fine. On a 24 h it is not: someone gets the
// 03:00 stint who cannot stay awake, the wet stints land on the driver who
// hates rain, one man ends up with four in a row and another with two, and the
// strategist fixes all of it by hand afterwards.
//
// So each driver may state what they want, and the fill honours it:
//
//   • night driving  — real wall-clock night, from the plan's race start
//   • rain           — stints already marked half wet / wet
//   • the start      — being in the car when the flag drops
//   • how many stints in a row they are willing to do
//
// plus the availability grid, which is not a preference but a fact and is
// treated as one.
//
// Preferences are SOFT: a preference is a cost, never a veto, because a plan
// that refuses to seat anybody is worse than one that asks a driver for a
// favour. Availability and the consecutive limit are hard while any legal
// choice remains, and the result reports every compromise it had to make —
// what a strategist needs is not a perfect answer but a truthful one.
//
// Pure module: no React, no DB, no "use server".

export type StintPref = "" | "prefer" | "avoid";

export type AutofillDriver = {
  id: string;
  name: string;
  /** Race hours (0-based) this driver is NOT available. */
  blockedHours: number[];
  night?: StintPref;
  rain?: StintPref;
  start?: StintPref;
  /** Most stints in a row this driver wants. 0/undefined = no limit stated. */
  maxConsecutive?: number;
};

export type AutofillStint = {
  /** Race-clock window, seconds from the green flag. */
  startSec: number;
  endSec: number;
  /** Wall-clock start, ms UTC — null when the plan has no race start time. */
  wallStartMs: number | null;
  /** True when this stint is half wet or full wet. */
  rain: boolean;
};

export type AutofillOptions = {
  /** Keep a driver in for two stints where the preferences allow it — the
   *  refuel-only stop is quicker, which is why teams do it. */
  doubleStint?: boolean;
  /** Wall-clock hours [from, to) counted as night, in the plan's local time.
   *  Default 23:00 → 06:00. */
  nightFromHour?: number;
  nightToHour?: number;
  /** Minutes to add to a UTC timestamp to get the plan's local wall clock.
   *  CLS shows race times in the browser's zone, so this is what the client
   *  passes in; the tests pass it explicitly. */
  localOffsetMin?: number;
};

/** What the fill did to each driver, so the UI can say it out loud. */
export type AutofillDriverReport = {
  driverId: string;
  name: string;
  stints: number;
  /** Stints in the driver's own night hours. */
  nightStints: number;
  rainStints: number;
  takesStart: boolean;
  longestRun: number;
  /** Preferences that could not be honoured, in plain words. */
  broken: string[];
};

export type AutofillResult = {
  /** driverId per stint index; null where nobody could be seated. */
  assignment: (string | null)[];
  perDriver: AutofillDriverReport[];
  /** Stints that had to go to somebody marked unavailable. */
  unavailableUsed: number[];
  /** Stints nobody at all could take. */
  unfilled: number[];
  /** Even split the balance term aims at. */
  fairShare: number;
};

const DEFAULT_NIGHT_FROM = 23;
const DEFAULT_NIGHT_TO = 6;

/** Is this stint in the night, by the plan's local wall clock? */
export function isNightStint(
  st: AutofillStint,
  opts: AutofillOptions = {}
): boolean {
  if (st.wallStartMs == null) return false; // no race start = no wall clock
  const from = opts.nightFromHour ?? DEFAULT_NIGHT_FROM;
  const to = opts.nightToHour ?? DEFAULT_NIGHT_TO;
  const off = (opts.localOffsetMin ?? 0) * 60_000;
  const hour = new Date(st.wallStartMs + off).getUTCHours();
  // The window normally wraps midnight (23 → 6); a non-wrapping one still works.
  return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
}

/** Hours of the race clock a stint touches — the availability grid's unit. */
function coveredHours(startSec: number, endSec: number): number[] {
  const h0 = Math.floor(startSec / 3600);
  const h1 = Math.floor(Math.max(startSec, endSec - 1) / 3600);
  const out: number[] = [];
  for (let h = h0; h <= h1; h++) out.push(h);
  return out;
}

function isFree(d: AutofillDriver, st: AutofillStint): boolean {
  const blocked = new Set(d.blockedHours ?? []);
  return coveredHours(st.startSec, st.endSec).every((h) => !blocked.has(h));
}

/**
 * Build the line-up.
 *
 * Greedy, stint by stint, lowest cost wins — deliberately, not a solver. A
 * strategist has to be able to look at a seat and understand why the man in it
 * is there; a global optimum nobody can explain gets overridden by hand and the
 * feature is dead. Ties break on the driver who has driven least, then on
 * roster order, so the same inputs always produce the same plan.
 */
export function autofillDrivers(
  stints: AutofillStint[],
  drivers: AutofillDriver[],
  opts: AutofillOptions = {}
): AutofillResult {
  const n = stints.length;
  const fairShare = drivers.length > 0 ? n / drivers.length : 0;
  const assignment: (string | null)[] = new Array(n).fill(null);
  const unavailableUsed: number[] = [];
  const unfilled: number[] = [];
  if (drivers.length === 0) {
    return { assignment, perDriver: [], unavailableUsed, unfilled, fairShare };
  }

  const count = new Map(drivers.map((d) => [d.id, 0]));
  const orderOf = new Map(drivers.map((d, i) => [d.id, i]));
  let prevId: string | null = null;
  let runLen = 0;

  for (let i = 0; i < n; i++) {
    const st = stints[i];
    const night = isNightStint(st, opts);
    const rain = st.rain;
    const isStart = i === 0;
    // Balance is measured against the driver who has done LEAST so far, not
    // against an absolute count: being two stints ahead of the field then costs
    // more than any single preference is worth, so wishes decide between
    // drivers who are level and never quietly hand one man the whole night.
    const minCount = Math.min(...drivers.map((d) => count.get(d.id) ?? 0));

    type Cand = { d: AutofillDriver; cost: number; free: boolean };
    const cands: Cand[] = drivers.map((d) => {
      const free = isFree(d, st);
      const continuing = d.id === prevId;
      const wouldRun = continuing ? runLen + 1 : 1;
      const maxRun = d.maxConsecutive && d.maxConsecutive > 0 ? d.maxConsecutive : Infinity;

      let cost = 0;
      // Availability is a fact, not a wish: never chosen while anyone else can
      // go, but not an absolute veto — an unseated stint helps nobody.
      if (!free) cost += 10_000;
      // Past the driver's own limit on stints in a row.
      if (wouldRun > maxRun) cost += 1_000;

      // Balance: the further ahead of the least-used driver, the more expensive.
      cost += ((count.get(d.id) ?? 0) - minCount) * 30;

      // Preferences, in the order they matter to people.
      if (night) cost += d.night === "avoid" ? 60 : d.night === "prefer" ? -25 : 0;
      if (rain) cost += d.rain === "avoid" ? 60 : d.rain === "prefer" ? -25 : 0;
      if (isStart) cost += d.start === "avoid" ? 60 : d.start === "prefer" ? -40 : 0;

      // Double stints: a refuel-only stop is quicker, so keep the same driver in
      // for a second stint when their own limit allows it. Never a third —
      // that is what maxConsecutive is for.
      if (opts.doubleStint && continuing && wouldRun === 2 && wouldRun <= maxRun) {
        // Bigger than one stint's balance penalty on purpose: the second half
        // of a pair must beat "somebody else has driven less", or no pair ever
        // forms. Two ahead still costs more than the pairing is worth, so the
        // rotation resumes by itself.
        cost -= 45;
      } else if (!opts.doubleStint && continuing) {
        // Otherwise rotate: back-to-back stints are the exception.
        cost += 15;
      }

      return { d, cost, free };
    });

    cands.sort((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      const ca = count.get(a.d.id) ?? 0;
      const cb = count.get(b.d.id) ?? 0;
      if (ca !== cb) return ca - cb;
      return (orderOf.get(a.d.id) ?? 0) - (orderOf.get(b.d.id) ?? 0);
    });

    const picked = cands[0];
    if (!picked) {
      unfilled.push(i);
      prevId = null;
      runLen = 0;
      continue;
    }
    if (!picked.free) unavailableUsed.push(i);
    assignment[i] = picked.d.id;
    count.set(picked.d.id, (count.get(picked.d.id) ?? 0) + 1);
    runLen = picked.d.id === prevId ? runLen + 1 : 1;
    prevId = picked.d.id;
  }

  // ---- what the fill had to compromise ------------------------------------
  const perDriver: AutofillDriverReport[] = drivers.map((d) => {
    let nightStints = 0;
    let rainStints = 0;
    let longestRun = 0;
    let run = 0;
    let takesStart = false;
    for (let i = 0; i < n; i++) {
      if (assignment[i] !== d.id) {
        run = 0;
        continue;
      }
      run += 1;
      longestRun = Math.max(longestRun, run);
      if (i === 0) takesStart = true;
      if (isNightStint(stints[i], opts)) nightStints += 1;
      if (stints[i].rain) rainStints += 1;
    }
    const stintCount = count.get(d.id) ?? 0;
    const maxRun = d.maxConsecutive && d.maxConsecutive > 0 ? d.maxConsecutive : Infinity;

    const broken: string[] = [];
    if (d.night === "avoid" && nightStints > 0)
      broken.push(`${nightStints} night stint${nightStints === 1 ? "" : "s"}`);
    if (d.night === "prefer" && nightStints === 0 && stints.some((st) => isNightStint(st, opts)))
      broken.push("no night stint");
    if (d.rain === "avoid" && rainStints > 0)
      broken.push(`${rainStints} wet stint${rainStints === 1 ? "" : "s"}`);
    if (d.rain === "prefer" && rainStints === 0 && stints.some((st) => st.rain))
      broken.push("no wet stint");
    if (d.start === "avoid" && takesStart) broken.push("takes the start");
    if (d.start === "prefer" && !takesStart) broken.push("not on the start");
    if (longestRun > maxRun) broken.push(`${longestRun} stints in a row`);
    const blockedUsed = stints.filter((st, i) => assignment[i] === d.id && !isFree(d, st)).length;
    if (blockedUsed > 0)
      broken.push(`${blockedUsed} stint${blockedUsed === 1 ? "" : "s"} outside their availability`);

    return {
      driverId: d.id,
      name: d.name,
      stints: stintCount,
      nightStints,
      rainStints,
      takesStart,
      longestRun,
      broken,
    };
  });

  return { assignment, perDriver, unavailableUsed, unfilled, fairShare };
}
