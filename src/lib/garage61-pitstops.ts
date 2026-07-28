/**
 * Derive measured pit-stop constants from a Garage 61 session export.
 *
 * This is Johann Solowej's `pitstops.xlsx` as code. His method, verbatim:
 * the pit lane is contained in the LAST sector of the in-lap plus the FIRST
 * sector of the out-lap, so that pair — measured against the same pair on
 * clean laps — is the time a stop actually cost. Nothing else in a lap time
 * is trustworthy for this: an out-lap is slow for reasons that have nothing
 * to do with the pits.
 *
 *   loss(stop before lap k) = lastSector(k-1) + firstSector(k) − reference
 *   reference               = median of that pair over clean, non-pit laps
 *
 * The API cannot feed this — Garage 61's /laps endpoint filters in- and
 * out-laps out entirely (verified). The session export keeps them, together
 * with `Fuel added`, which is why the upload path is the one that works.
 *
 * Pure module: no React, no I/O — the tests drive it against his real numbers.
 */

export type PitLapRow = {
  /** Lap number within the session (ordering key). */
  lap: number;
  driver: string;
  laptimeSec: number;
  /** Sector times of THIS lap, in order. */
  sectors: number[];
  /** Litres put in at the stop this lap came out of (0 when none). */
  fuelAdded: number;
  pitIn: boolean;
  pitOut: boolean;
  clean: boolean;
};

/** What actually happened at a stop. The data cannot tell us — a human can. */
export type StopKind =
  | "drivethrough" // through the lane, never stopped
  | "stop" // stopped, no service at all (stop & go)
  | "tyres" // tyres only
  | "fuel" // fuel only
  | "fuel+tyres";

export type DetectedStop = {
  /** The lap the car came OUT on — the stop happened just before it. */
  lap: number;
  driver: string;
  /** Total time lost versus a clean lap, in seconds. */
  lossSec: number;
  /** Litres added, straight from the export (0 = no fuel). */
  litres: number;
  /** Our guess at what happened, which the user can correct. */
  kind: StopKind;
};

export type PitStopScan = {
  ok: boolean;
  error: string | null;
  /** Median clean-lap value of (last sector + next lap's first sector). */
  referenceSec: number | null;
  /** How many clean lap pairs the reference is built from. */
  referenceSamples: number;
  stops: DetectedStop[];
};

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Find the stops in one session and what each cost.
 * Rows must come from a single session; they are sorted by lap here.
 */
export function scanPitStops(rows: PitLapRow[]): PitStopScan {
  const laps = [...rows]
    .filter((r) => r.sectors.length >= 2 && r.laptimeSec > 0)
    .sort((a, b) => a.lap - b.lap);
  if (laps.length < 3) {
    return {
      ok: false,
      error:
        "Not enough laps with sector times — the export needs the sector columns to measure a pit stop.",
      referenceSec: null,
      referenceSamples: 0,
      stops: [],
    };
  }

  const first = (r: PitLapRow) => r.sectors[0];
  const last = (r: PitLapRow) => r.sectors[r.sectors.length - 1];
  const isPitLap = (r: PitLapRow) => r.pitIn || r.pitOut;

  // Reference: the same sector pair on consecutive laps that never saw the pits.
  const refs: number[] = [];
  for (let i = 0; i < laps.length - 1; i++) {
    const a = laps[i];
    const b = laps[i + 1];
    if (b.lap !== a.lap + 1) continue; // only consecutive laps
    if (isPitLap(a) || isPitLap(b)) continue;
    if (!a.clean || !b.clean) continue;
    refs.push(last(a) + first(b));
  }
  if (refs.length === 0) {
    return {
      ok: false,
      error:
        "No clean back-to-back laps found to measure against — drive a few green laps in the same session.",
      referenceSec: null,
      referenceSamples: 0,
      stops: [],
    };
  }
  const referenceSec = median(refs);

  // Every lap the car came out of the pits on carries a stop before it.
  const stops: DetectedStop[] = [];
  for (let i = 1; i < laps.length; i++) {
    const out = laps[i];
    const inLap = laps[i - 1];
    if (!out.pitOut && !(out.pitIn && out.pitOut)) continue;
    if (out.lap !== inLap.lap + 1) continue;
    const lossSec = last(inLap) + first(out) - referenceSec;
    if (!isFinite(lossSec)) continue;
    const litres = out.fuelAdded > 0 ? out.fuelAdded : 0;
    stops.push({
      lap: out.lap,
      driver: out.driver,
      lossSec,
      litres,
      // A first guess only: fuel is visible in the data, tyres never are.
      kind: litres > 0 ? "fuel+tyres" : "stop",
    });
  }

  return {
    ok: stops.length > 0,
    error: stops.length > 0 ? null : "No pit stops found in this session.",
    referenceSec,
    referenceSamples: refs.length,
    stops,
  };
}

export type DerivedPitConstants = {
  laneLossSec: number | null;
  tyreChangeSec: number | null;
  refuelLps: number | null;
  /** True when the data shows tyres adding to the fuel time rather than
   *  overlapping it. Null when it can't be told from these stops. */
  tyreSequential: boolean | null;
  /** What was used for each figure, and what is missing — shown to the user
   *  instead of quietly producing a number out of thin air. */
  notes: string[];
};

/**
 * Turn labelled stops into the four constants the planner needs.
 *
 * Deliberately conservative: a figure the stops cannot support comes back null
 * with a note saying which stop is missing, rather than a plausible guess.
 */
export function derivePitConstants(stops: DetectedStop[]): DerivedPitConstants {
  const notes: string[] = [];
  const of = (k: StopKind) => stops.filter((s) => s.kind === k);
  const med = (xs: number[]) => (xs.length ? median(xs) : null);

  // 1. Lane loss = a stop with no service at all. That is what the planner's
  //    "pit lane loss" means, and it is the anchor for everything else.
  const stopOnly = of("stop");
  const dt = of("drivethrough");
  let laneLossSec = med(stopOnly.map((s) => s.lossSec));
  if (laneLossSec == null && dt.length > 0) {
    laneLossSec = med(dt.map((s) => s.lossSec));
    notes.push(
      "No stop-without-service in this session, so the lane loss comes from the drive-through — it is a second or four optimistic (stopping itself costs time)."
    );
  }
  if (laneLossSec == null) {
    notes.push(
      "No drive-through and no service-free stop, so the lane loss cannot be separated from the service time."
    );
  }

  // 2. Tyres = a tyres-only stop, minus the lane loss.
  const tyresOnly = of("tyres");
  let tyreChangeSec: number | null = null;
  if (tyresOnly.length > 0 && laneLossSec != null) {
    tyreChangeSec = Math.max(0, (med(tyresOnly.map((s) => s.lossSec)) ?? 0) - laneLossSec);
  } else if (tyresOnly.length === 0) {
    notes.push("No tyres-only stop, so the tyre-change time could not be measured.");
  }

  // 3. Refuelling. Cleanest from a fuel-only stop; otherwise the difference
  //    between fuel+tyres and tyres-only — which is exactly how his sheet
  //    does it (D9 = C9 − C8).
  const fuelOnly = of("fuel").filter((s) => s.litres > 0);
  const fuelTyres = of("fuel+tyres").filter((s) => s.litres > 0);
  let refuelLps: number | null = null;
  let tyreSequential: boolean | null = null;

  if (fuelOnly.length > 0 && laneLossSec != null) {
    const rates = fuelOnly
      .map((s) => s.litres / (s.lossSec - laneLossSec!))
      .filter((r) => isFinite(r) && r > 0);
    refuelLps = med(rates);
    // With both kinds present we can see whether tyres cost extra on top.
    if (fuelTyres.length > 0 && tyreChangeSec != null) {
      const fo = med(fuelOnly.map((s) => s.lossSec))!;
      const ft = med(fuelTyres.map((s) => s.lossSec))!;
      tyreSequential = ft - fo > tyreChangeSec * 0.5;
      notes.push(
        tyreSequential
          ? "Fuel + tyres cost clearly more than fuel alone: the tyre change adds to the refuelling (sequential)."
          : "Fuel + tyres cost about the same as fuel alone: the tyre change happens under the refuelling (parallel)."
      );
    }
  } else if (fuelTyres.length > 0 && tyresOnly.length > 0) {
    const ft = med(fuelTyres.map((s) => s.lossSec))!;
    const to = med(tyresOnly.map((s) => s.lossSec))!;
    const litres = med(fuelTyres.map((s) => s.litres))!;
    const fuelSec = ft - to;
    if (fuelSec > 0) {
      refuelLps = litres / fuelSec;
      tyreSequential = true;
      notes.push(
        "Refuel rate from (fuel + tyres) − (tyres only), which assumes the tyre change does not overlap the fill — the same assumption his spreadsheet makes."
      );
    }
  } else if (fuelTyres.length > 1) {
    // Several fuel stops with different fills: the slope of loss against
    // litres is 1/rate, whatever the fixed part happens to be.
    const xs = fuelTyres.map((s) => s.litres);
    const ys = fuelTyres.map((s) => s.lossSec);
    const n = xs.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const den = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0);
    if (den > 1e-9) {
      const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;
      if (slope > 0) {
        refuelLps = 1 / slope;
        notes.push(
          `Refuel rate fitted across ${n} stops with different fuel loads (no service-free stop to anchor the lane loss).`
        );
      }
    }
  }
  if (refuelLps == null) {
    notes.push("No stop with fuel, so the refuel rate could not be measured.");
  }

  return { laneLossSec, tyreChangeSec, refuelLps, tyreSequential, notes };
}
