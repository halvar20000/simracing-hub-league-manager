/**
 * English strings for the stint planner. See `./planner.ts` for how this is
 * paired with `planner-de.ts` — this file is the source of truth for the key
 * set, so add here first and the compiler will point at the German gap.
 *
 * Grouped by the card it belongs to, in the order the cards appear on screen.
 * Keys ending in `Hint` are the hover explanations; every input a user can get
 * wrong should have one. Sentences that need a number or a name in the middle
 * are functions, not templates — word order differs too much between the two
 * languages for a `{n}` placeholder to survive translation.
 *
 * Deliberately NOT `as const`: the values must widen to `string` so the German
 * file can be typed against this one.
 */
export const en = {
  // ---- chrome shared by the whole planner -------------------------------
  ui: {
    language: "Language",
    mode: "Mode",
    easy: "Easy",
    advanced: "Advanced",
    easyHint:
      "Easy hides the parts most teams never touch. Nothing stops working — it is only off screen.",
    advancedHint:
      "Advanced shows every knob: the detailed pit-stop model and the values measured from a session.",
    hiddenInEasy: "Hidden in Easy mode",
    showAdvanced: "Switch to Advanced",
    guide: "Guide",
    guideHint:
      "Open the manual for this section in a new tab. The manual is the team's own document and is written in German.",
  },
  common: {
    /** A decimal in the language's own notation (German uses a comma). */
    dec: (n: number, digits: number) => n.toFixed(digits),
    apply: "Apply",
    clear: "Clear",
    save: "Save",
    saving: "Saving…",
    delete: "Delete",
    close: "Close",
    add: "Add",
    remove: "Remove",
    none: "None",
    unassigned: "— Unassigned —",
    selectTrack: "— Select track —",
    selectCar: "— Select car —",
    serverUnreachable: "Could not reach the server — please try again.",
  },


  // ---- page header ------------------------------------------------------
  header: {
    planTitle: "Plan title",
    planTitleHint:
      "The name this plan is listed and shared under. Track and race length make the most useful title.",
    planTitlePlaceholder: "e.g. 6h Road America",
    saveShare: "Save & share",
    live: "Live · auto-saving",
    liveSaving: "Saving…",
    liveError: "Sync error — retrying",
    liveHint:
      "This plan is live: your edits save automatically and everyone with the link sees them within a few seconds.",
    completedRo: "Completed · read-only",
    completedRoHint: "This plan is completed — the plan itself can no longer be changed.",
    copyLink: "Copy link",
    postDiscord: "Post to Discord",
    postingDiscord: "Posting…",
    markCompleted: "✓ Mark completed",
    completing: "Completing…",
    markCompletedHint:
      "Freeze the plan after the race — the debrief stays open, and you can reopen it any time.",
    reopen: "↩ Reopen plan",
    reopening: "Reopening…",
    print: "Print",
    confirmArchive:
      "Mark this plan as completed?\n\nThe event, drivers, stints and live corrections are frozen and the Discord alerts stop. You can still add the eventresult, the race log, pictures and post-race notes — and reopen the plan any time.",
    archived: "Plan marked as completed.",
    reopened: "Plan reopened.",
    frozenTitle: "Completed plan.",
    frozenBody:
      "Event, drivers, stints and live corrections are locked and no Discord alerts go out. Race result, race log, pictures and post-race notes can still be added.",
    staleTitle: "A newer version of CLS is live",
    staleBody:
      "and this tab is still running the old one — uploads and auto-save will fail until you reload.",
    reloadNow: "Reload now",
  },

  // ---- free-text notes card --------------------------------------------
  notes: {
    enlarge: "⤢ Enlarge",
    enlargeHint: "Open this field over the whole page — Escape closes it.",
    doneEsc: "Done (Esc)",
    savesAsYouType: "Saves as you type, exactly like the small field.",
  },

  // ---- "what is still missing" checklist --------------------------------
  checklist: {
    title: "Getting this plan ready",
    lead: (open: number, total: number) =>
      `${total - open} of ${total} done — click a step to jump to it.`,
    track: "Pick the track",
    car: "Pick the car",
    duration: "Set the race length",
    lapDistance: "Enter the lap distance",
    lapTime: "Enter a lap time",
    fuelPerLap: "Enter fuel per lap",
    tank: "Enter the tank size",
    drivers: "Add the drivers",
    start: "Set the session start",
  },
  // ---- Event card: "what is this race" ----------------------------------
  ev: {
    title: "Event",
    leagueRace: "League race",
    officialRace: "Official race",
    leagueRaceHint:
      "Debrief compares every driver against the fastest lap in class.",
    officialRaceHint:
      "Debrief compares every driver against the lap time his own iRating was worth, plus a fixed 10k reference.",
    track: "Track",
    trackHint:
      "The circuit this race runs on. Used to find measured pit constants and Garage 61 laps for exactly this track — pick it even if you type every number by hand.",
    car: "Car",
    carHint:
      "The car you are racing. Together with the track it decides which measured pit values and which Garage 61 laps apply.",
    raceEndsOn: "Race ends on",
    raceEndsOnHint:
      "Time: the flag falls on the clock. Laps / Distance: it falls when the distance is covered — the finish time is then a projection.",
    optTime: "Time",
    optLaps: "Laps",
    optDistance: "Distance",
    raceDuration: "Race duration (h:mm:ss)",
    raceDurationHint:
      "How long the race runs, from the green flag. 6:00:00 for a 6 h, 0:45:00 for a 45-minute sprint.",
    roundRaceEnd: "Margin Lap",
    roundRaceEndBody:
      "— the race runs to the end of the lap the clock expires on and one more after it, instead of being cut mid-lap. Those laps cost fuel, so the plan may show a splash the old rule hid.",
    projectedFinishLabel: "Projected finish:",
    raceLaps: "Race laps",
    raceLapsHint: "Lap count the race is run over.",
    raceLapsPlaceholder: "e.g. 500",
    raceDistance: "Race distance",
    raceDistanceHint:
      "Distance the race is run over. Divided by the lap length below to get a lap target.",
    raceDistancePlaceholder: "e.g. 1000",
    lapLength: "Lap length (km)",
    lapLengthHint: "Length of one lap of this track configuration, in kilometres.",
    lapLengthPlaceholder: "e.g. 7.004",
    laps: (n: number | string) => `${n} laps`,
    roundedUp: "(rounded up — the distance has to be covered).",
    raceEndsAfter: "Race ends after",
    lapsUnplanned: (n: string) => `— ${n} laps unplanned, add stints`,
    raceStart: "Race start",
    raceStartHint:
      "The moment the green flag falls. Everything on the plan is counted from here: put in the expected time beforehand, and hit “Now” when the flag actually drops.",
    now: "Now",
    nowHint: "Stamp the green flag on this second. Every stint shifts with it.",
    nowAlsoDuring: "Hit “Now” when the flag falls — also on the Schedule & Live tab.",
    stopComputedPre: "A stop is computed from the litres actually taken — a full service costs",
    stopComputedPost: "here.",
    stopFlatPre: "Every stop costs a flat",
    stopFlatPost: ".",
    stopWhere: "Pit times, driver swap and the measured constants are set under",
    tank: "Fuel tank (L)",
    tankHint:
      "Usable tank capacity of the car in litres. This, and the consumption per lap, is what sets the maximum stint length.",
    reserve: "Fuel reserve (L)",
    reserveHint:
      "Fuel kept in the tank as a safety margin — reduces laps per stint.",
    gridFuel: "Fuel to the grid (L)",
    gridFuelHint:
      "Fuel burned between leaving the box and the green flag — the lap to the grid plus the laps behind the pace car. It is gone before the race starts, so it comes off the FIRST stint only.",
    gridFuelPlaceholder: "e.g. 1.6",
    officialBox: "Official race — comparison basis",
    refLap: "Reference lap (10k)",
    refLapHint:
      "The lap a very strong (≈10k iRating) driver sets here. Replaces the class best as the yardstick, so the number stays comparable across races instead of moving with whoever showed up. Leave empty to read it off the pace curve.",
    paceCurve: "Pace curve (iRating → lap)",
    paceCurveHint:
      "A measured iRating → lap-time curve for this track. With it the debrief tells every driver what his own iRating was worth here.",
    curveNone: "— none —",
    curveExplainPre: "Each driver is measured against the lap his own iRating was worth here —",
    curveExplainPoints: (n: number) => `${n} points,`,
    curveExplainAt1000: "at 1000 iR to",
    curveExplainAt10k: "at 10k. Their iRating comes out of the uploaded",
    curveSuggestPre: "The library has",
    curveSuggestPost: "for this track — pick it to get per-driver target lap times.",
    curveNonePre: "No curve for this track yet. Anyone on a team roster can add one under",
    curveNoneLink: "Team statistics → Pace references",
    curveNonePost: "; without it only the reference lap above is used.",
    trackTemp: "Track temp (°C)",
    trackTempHint:
      "Expected race-day track temperature. Lap times are adjusted to it using the Garage 61 temperature fit (or the manual coefficient). Applied when you leave the field.",
    trackTempPlaceholder: "e.g. 30",
    tyreMin: "Tyres still raceable at (%)",
    tyreMinHint:
      "Stints that end below this are flagged — the floor for double-stinting a set. Your call, not something a session can measure.",
    stintLength: "Stint length",
    stintLengthHint:
      "Fuel-limited is the normal case: a stint runs until the tank is empty. Fixed time or laps forces a length instead — for a race with a mandatory stint window.",
    stintFuel: "Fuel-limited",
    stintTime: "Fixed time",
    stintLaps: "Fixed laps",
    stintMinutes: "Stint minutes",
    stintLapsField: "Stint laps",
    stintValueHint: "The forced stint length every stint is cut to.",

    // temperature model strip
    tempNoModel:
      "Set the expected track temp, then import or pull Garage 61 laps — with laps across a range of temps it calibrates how much lap time changes per degree and adjusts the pace.",
    tempPaceSetAt: "Pace set at",
    tempSensitivity: "· sensitivity",
    tempFromData: "(from Garage 61 data)",
    tempManual: "(manual estimate)",
    tempPending: (delta: string, temp: number) =>
      `→ leaving the field shifts lap times ${delta}s for ${temp}°C`,
    tempPer10: "s/10°C:",
    tempPer10Hint:
      "Manual lap-time sensitivity (seconds per 10°C), used when the data has no temperature spread to fit.",

    // weather + traffic penalties
    fullWet: "Full wet",
    fullWetHint:
      "Seconds per lap on a soaked track. Measured from your rain laps when available; edit to override.",
    halfWet: "Half wet",
    halfWetHint:
      "Seconds per lap on a damp or drying track — slippery, but nothing like full wet. Leave empty to use a share of the full-wet penalty.",
    traffic: "Race traffic",
    trafficHint:
      "Seconds per lap the team is slower in the race than in practice: traffic, dirty air, cars to pass and to be passed by. Added to EVERY stint — practice pace is always optimistic.",
    perLap: "s/lap",
    wetMeasured: "(measured from rain laps)",
    wetManual: "(manual estimate)",
    halfYours: "your figure",
    halfDefault: (pct: number) => `default: ${pct}% of full wet`,
    trafficNote: "on every stint — practice pace is set alone, a race is not",
    weatherNote:
      "Weather is picked per stint in the schedule below; traffic applies to all of them.",

    // single vs double stints
    doubleStint: "Double stints (each driver runs 2 stints between swaps)",
    doubleStintHint:
      "Pairs the stints up when the drivers are filled in automatically: everyone does two in a row before the car is handed over. Saves the driver-change time at every second stop.",
    dsNeedRefuelPre: "Enter a",
    dsNeedRefuelBold: "Refuel time",
    dsNeedRefuelPost:
      "above to compare single vs double-stinting (a driver swap only costs time when it’s longer than fuelling).",
    dsHidden: (refuel: number, swap: number) =>
      `At ${refuel}s refuel the ${swap}s swap is hidden under fuelling — a driver change costs no extra time, so double-stinting saves nothing here (decide on driver stamina).`,
    dsCostPre: "A driver change costs",
    dsCostPost: (swap: number, refuel: number) => `(swap ${swap}s − refuel ${refuel}s).`,
    dsThisPlan: (same: number, stops: number) =>
      `This plan: ${same}/${stops} stops refuel-only → saves`,
    dsVsSingle: "vs single-stinting.",
    dsSaves: (sec: string, laps: string) => `~${sec}s (~${laps} laps)`,
    dsFull: (same: number, stops: number, sec: string, laps: string) =>
      `Full double-stint plan: ${same}/${stops} refuel-only → saves ~${sec}s (~${laps} laps). Trade-off: a driver runs two stints back-to-back.`,
  },
  // ---- Pit-stop model card ----------------------------------------------
  pit: {
    title: "Pit-stop model",
    loadMeasured: "📥 Load measured values",
    hide: "Hide",
    show: "Show",
    hideHint:
      "Fold the pit-stop model away. The plan keeps using every value in it — only the card is hidden, on this device.",
    showHint: "Open the pit-stop model again.",
    collapsedFlat: (sec: string) => `Flat pit loss ${sec} s.`,
    collapsedDetailed: "Detailed pit-stop model on.",
    collapsedNote: "The plan counts with it either way — only the card is folded away.",
    loadMeasuredCarDefault: "📥 Load measured values (car default)",
    loadMeasuredExact: (car: string, track: string, source: string | null) =>
      `Measured for ${car} at ${track}${source ? ` — ${source}` : ""}`,
    loadMeasuredDefault: (car: string, source: string | null) =>
      `Measured for ${car} (car default)${source ? ` — ${source}` : ""}`,
    computeEvery: "compute every stop",
    computeEveryHint:
      "Off: every stop costs the same flat number of seconds. On: each stop is priced from the litres actually taken, whether tyres go on and whether the driver changes — which is what makes a splash cheaper than a full service.",

    // simple model
    pitLoss: "Pit time loss (s)",
    pitLossHint: "Total time lost at a normal (driver-change) pit stop.",
    refuelSec: "Refuel time (s)",
    refuelSecHint:
      "How long fuelling takes at a full stop. If ≥ driver swap, a swap is hidden under fuelling (free) and double-stinting saves no time.",
    refuelSecPlaceholder: "e.g. 40",
    driverSwap: "Driver swap (s)",
    driverSwapHint:
      "Mandatory driver-swap floor. iRacing = 30s; it runs concurrently with fuelling, so it only costs time when fuelling is shorter than this. Used by the detailed model too.",
    driverSwapHintShort:
      "Mandatory driver-swap floor. iRacing = 30s; it runs concurrently with fuelling, so it only costs time when fuelling is shorter than this.",
    flatPre: "Every stop currently costs the same flat",
    flatPost:
      ". Switch this on to compute each stop from the litres actually taken, whether tyres are changed and whether the driver changes — that is what makes a splash cheaper than a full service, and it is measured once per car and track.",

    // detailed model
    measuredTitle: "Measured values.",
    measuredBodyPre: "These three come out of a session export (or the pit-reference library) — see",
    measuredBodyEm: "Measure these from a session",
    measuredBodyPost: "below. Type them by hand only if you have measured them another way.",
    laneLoss: "Pit lane loss (s)",
    laneLossHint:
      "Time lost entering, stopping and leaving the pits WITHOUT any service, measured against a green lap.",
    refuelRate: "Refuel rate (L/s)",
    refuelRateHint: "GT3 ≈ 2.5 L/s, LMP ≈ 1.81 L/s.",
    tyreChange: "Tyre change (s)",
    tyreChangeHint:
      "How long a full tyre change takes once the car is stationary. ≈ 20 s for a GT3.",
    tyresAfter: "tyres AFTER fuelling",
    tyresAfterHint:
      "On: the crew changes tyres once fuelling is done, so the two add up. Off: they work in parallel and only the longer of the two is on the clock.",
    noModelWarn:
      "Enter the pit lane loss — without it there is nothing to compute a stop from, so the flat pit loss stays in use.",
    noModelHow:
      "Type them in, take them from the pit-reference library, or measure them from a session export — see just below.",
    fullService: (litres: string) => `Full service (${litres} L + tyres + driver change):`,
    halfFill: "Half fill, no tyres, same driver:",
    cheaperThanFull: (sec: string) => `— ${sec} s cheaper than a full stop`,

    // measuring from a session export
    measureTitle: "Measure these from a session",
    reading: "Reading…",
    uploadXlsx: "Upload session export (.xlsx)",
    poolHint:
      "The same file also carries the green laps. On: they are added to the plan's lap pool. Off: they replace the Garage 61 data this plan holds.",
    poolPre: "A file dropped here also fills the",
    poolBoldPool: "lap pool",
    poolMid: "in the Garage 61 card — pace and fuel come out of the same laps. Ticked, it is",
    poolBoldAdded: "added",
    poolMid2: "to the laps already there",
    poolCount: (laps: number, imports: number) =>
      ` (${laps} laps from ${imports} import${imports === 1 ? "" : "s"} right now)`,
    poolPost: "; unticked it replaces them. Same switch as down there.",
    exportExplainPre: "The fields above are filled from a Garage 61",
    exportExplainBold: "session export",
    exportExplainMid:
      "— in Garage 61 open the session and choose Export, then drop the .xlsx here. A Garage 61",
    exportExplainEm: "pull",
    exportExplainPost:
      "cannot do it: the API leaves out in- and out-laps and never reports the fuel added, and those are exactly what a stop is measured from. CLS finds the stops in the file, you say what happened at each, and one click puts the numbers in the fields above.",
    howToDrive: "How to drive the measuring session",
    protocol:
      "To measure everything in one session: 3–4 clean laps in a row (the reference), then one lap through the pit lane without stopping, one stop with no service at all, one stop with tyres only, and one stop with fuel only (no tyres) — a big fill is best. Come back out and do a clean lap after each.",
    noStops: "No pit stops measured",
    stopsFound: (n: number) =>
      `${n} pit stop${n === 1 ? "" : "s"} measured in this session`,
    referenceSection: (sec: string, samples: number) =>
      `Reference lap section: ${sec} s (median of ${samples} clean lap pairs). Each stop is the last sector before the pits plus the first sector after, minus that reference. Say what happened at each stop — the export records the fuel, never the tyres.`,
    colLap: "Lap",
    colDriver: "Driver",
    colTimeLost: "Time lost",
    colFuel: "Fuel",
    colWhatHappened: "What happened",
    kindDrivethrough: "drove through",
    kindStop: "stopped, no service",
    kindTyres: "tyres only",
    kindFuel: "fuel only",
    kindFuelTyres: "fuel + tyres",
    derivedLane: "Lane loss:",
    derivedTyre: "Tyre change:",
    derivedRefuel: "Refuel:",
    derivedSequential: "tyres after fuelling",
    derivedParallel: "tyres under fuelling",
    useInPlan: "Use in this plan",
    saveToLibrary: "Save to pit-reference library",
    saveToLibraryHint: (car: string, track: string) =>
      `Save as the measured values for ${car}${track ? ` @ ${track}` : ""}`,
    dismiss: "Dismiss",
    easyNoteFlat: (sec: string) =>
      `Pit-stop model: every stop costs a flat ${sec} s.`,
    easyNoteDetailed: (sec: string) =>
      `Pit-stop model: stops are computed from measured values — a full service costs ${sec} s.`,
  },
  // ---- what a pit stop is made of (the Stop-column tooltip) -------------
  breakdown: {
    lane: "lane",
    fuel: "fuel",
    tyres: "tyres",
    overlapped: (sec: string, what: string) => `${sec}s ${what} overlapped`,
    driverChange: "driver change",
  },
  // ---- Fuel profiles card ------------------------------------------------
  fuel: {
    title: "Fuel profiles",
    hideFallback: "Hide fallback profiles",
    editFallback: "Edit fallback profiles",
    standard: "Standard",
    standardFallback: "Standard (roster fallback)",
    savingProfile: "Fuel-saving",
    savingFallback: "Fuel-saving (roster default)",
    lapTime: "Lap time (m:ss)",
    lapTimeHint:
      "The lap time a stint is computed from. In per-driver mode this is only the fallback for a driver with no time of their own — a race average, not a qualifying lap.",
    fuelPerLap: "Fuel / lap (L)",
    fuelPerLapHint:
      "Litres burned per lap. Together with the tank size this decides how long a stint runs. Take it from a race stint, not from a single hot lap.",
    lapsPerStint: "Laps/stint:",
    onTrack: "On-track:",
    plusPit: "+pit:",
    fuelPerStint: "Fuel/stint:",
    fallbackPre: "Every stint runs on the driver’s own pace and fuel. Only a driver with no numbers of their own falls back to",
    fallbackSavingPre: ", and to the plan’s fuel-save default of",
    whereNumbers: "Where a stint gets its numbers",
    modeDelta: "Per driver",
    modeAbsolute: "Profile only (legacy)",
    deltaExplainPre: "Every stint runs on the",
    deltaExplainBold: "driver’s own average pace and fuel",
    deltaExplainPost:
      "from the Drivers table; the Standard profile above is only the fallback for a driver who has none. A fuel-save stint adds that driver’s fuel-save delta on top.",
    absoluteExplain:
      "Legacy model: the profiles below are the numbers, and a driver’s own figures simply replace them — which makes the fuel-saving profile a no-op for anyone who has their own pace and fuel. Kept so plans that were built and signed off this way still read exactly as they did.",
    enableSaving: "Enable a fuel-saving profile",
    enableSavingHint:
      "Adds a second profile for lifting and coasting, so a stint can be planned slower but with fewer litres — which sometimes takes a stop out of the race.",
    againstStandardPre: "Against Standard that is",
    againstStandardMid: "— the effort a driver gives up on an",
    fsShort: "FS",
    againstStandardMid2: "stint unless they carry their own figures in the",
    fsPlusS: "FS +s",
    fsMinusL: "FS −L",
    againstStandardPost:
      "columns of the Drivers table. Lifting and coasting is a skill: not everyone buys the same litres at the same price.",
    deltaZero:
      "Right now both are zero, so a fuel-save stint is identical to a normal one.",
    overFuel:
      "⚠ This stint length needs more fuel than the usable tank holds. Reduce the stint length or fuel reserve, or increase the tank.",
  },
  // ---- units that appear inside computed sentences ----------------------
  units: {
    lap: "lap",
    laps: "laps",
    stint: "stint",
    min: "min",
  },
  // ---- Roster card -------------------------------------------------------
  roster: {
    title: "Roster",
    empty:
      "No drivers yet — type a name in the field above. A driver has to be registered in CLS to appear there. Add them before pulling from Garage 61: the pull matches on name, so anyone not on this list is ignored.",
    gapHint:
      "No pace or fuel of their own yet — their stints run on the Standard profile",
    ownFigures: (lap: string, fuel: string) => `${lap} · ${fuel} L/lap`,
    countPre: (n: number) => `${n} driver${n === 1 ? "" : "s"}.`,
    countPost: "Pace, fuel and tyre wear are set in the",
    driversWord: "Drivers",
    countPost2:
      "table further down — it sits after the Garage 61 block, so the figures you settle on there are the last word.",
    missing: (n: number) =>
      `${n} of them ${n === 1 ? "has" : "have"} no figures of their own yet and would run on the Standard profile.`,
    pickerPlaceholder: "Add a CLS driver…",
    pickerHint:
      "Type a name to add a driver from CLS. Only registered CLS members can be added — the Garage 61 pull matches on the name, so a hand-typed one would never get any laps.",
    pickerNone: "no match",
  },

  // ---- Fuel-save strategy card ------------------------------------------
  fs: {
    title: "Fuel-save strategy",
    optimize: "Optimize",
    optimizeHint:
      "Tries every stop count and works out how much lap time you would have to give up to reach it. Nothing is applied to the plan — it is an analysis, not an instruction.",
    lead:
      "Race time is fixed, so this sweeps the pace & fuel band for the combination that covers the most distance — trading lap time for fewer pit stops. It uses your Standard and Fuel-save profiles as the band and weights the pace by your real per-driver lap times (by stints driven). Read it as an analysis: the plan's own numbers are left exactly as they are.",
    bestPre: "Best:",
    bestStops: (n: number) => `${n} stops`,
    bestTargetLap: "· target lap",
    bestFuelPre: "· ≤",
    bestFuelPost: "L/lap →",
    lapsValue: (n: string) => `${n} laps`,
    gainTime: (delta: string, faster: boolean, stops: number) =>
      ` — ${delta} ${faster ? "faster" : "slower"} than full push (${stops} stops).`,
    gainLaps: (delta: string, stops: number) =>
      ` — ${delta} laps vs full push (${stops} stops).`,
    fullPushOptimal: " — full push is optimal here.",
    colStops: "Stops",
    colTargetLap: "Target lap",
    colFuelPerLap: "Fuel/lap",
    colLapsPerStint: "Laps/stint",
    colRaceTime: "Race time",
    colTotalLaps: "Total laps",
    bestApplied: "best",
    assumesPre: "Assumes lap time varies linearly between your two profiles.",
    assumesTime:
      "The distance is fixed here, so the measure is the time it takes to cover it — saving fuel pays when it removes a stop.",
    assumesLaps: "“Total laps” is the distance measure (track length is constant).",
  },
  // ---- CLS driver autocomplete ------------------------------------------
  picker: {
    placeholder: "🔍 Add driver — type a name…",
    noMatch: (query: string) => `No CLS driver matches “${query}”.`,
    available: (n: number) => `${n} CLS drivers available · ↑↓ + Enter`,
  },
  // ---- Garage 61 import card --------------------------------------------
  g61: {
    title: "Garage 61 import",
    ageHint:
      "How far back to look. Pace from an old season was set on a different BoP, a different tyre model and often a different track surface — usually worse than no data at all.",
    ageCurrent: "Current season",
    agePrev: "This + last season",
    age30: "Last 30 days",
    age60: "Last 60 days",
    age90: "Last 90 days",
    ageAll: "All data",
    pull: "Pull from Garage 61",
    pulling: "Pulling…",
    pullHint:
      "Fetch your team's laps for the selected Track + Car directly from Garage 61.",
    upload: "Upload session export(s)",
    reading: "Reading…",
    cumulative: "Add to existing data",
    cumulativeHint:
      "On: the next pull or upload is ADDED to the laps this plan already holds, and pace, fuel and the temperature fit are recomputed over all of them. Off: each import replaces everything.",
    clearAsk: "Clear it?",
    clearAlsoFigures: "also the pace & fuel it filled in",
    clearYes: "Yes, clear",
    cancel: "Cancel",
    clearBtn: "Clear Garage 61 data",
    clearHint:
      "Remove the Garage 61 analysis from this plan — the tables go empty and you can pull again.",
    hide: "Hide",
    show: "Show Garage 61",
    hideHint:
      "Fold the Garage 61 tables and charts away. The data stays in the plan and keeps feeding pace and fuel — only the display is hidden, on this device.",
    showHint: "Show the Garage 61 tables and charts again.",
    collapsedNote:
      "Garage 61 data is loaded and still feeding the plan — the tables and charts are hidden on this device.",
    leadBold: "Pull from Garage 61",
    leadMid:
      "fetches your team’s laps for the selected Track + Car straight from the Garage 61 API — or upload session exports (.xlsx) manually. Either way, real race pace & fuel/lap per driver are read from the practice laps and fill the Standard profile plus each matching driver’s lap time. Only laps from the drivers on this plan (add them under",
    leadDrivers: "Drivers",
    leadMid2:
      "first) are included. Uploaded files are read in your browser — nothing is stored. Pit-stop constants come from an uploaded export too, but they are handled up in",
    leadPit: "Pit-stop model",
    leadPost: ", next to the fields they fill.",
    poolTitle: (laps: number, imports: number) =>
      `Lap pool — ${laps} laps from ${imports} import${imports === 1 ? "" : "s"}`,
    poolNote: (cap: number) =>
      `Pace, fuel and the temperature fit are computed over all of them. Cap ${cap} laps — the oldest import goes first.`,
    kindPull: "pull",
    kindFile: "file",
    sourceSummary: (laps: number, drivers: number, range: string) =>
      `${laps} laps · ${drivers} driver${drivers === 1 ? "" : "s"}${range}`,
    importedOn: (day: string) => `Imported ${day}`,
    removeSource: "Remove this import and recompute from the rest",
    connected: "● Connected to Garage 61",
    connectedTeam: (team: string) => ` · team ${team}`,
    connectedNoTeam: " · no team selected",
    sharedToken: "● Using the site’s shared Garage 61 token",
    notConnected: "● Not connected to Garage 61",
    disconnect: "Disconnect",
    changeToken: "Change token",
    connectToken: "Connect my token",
    saveFirst:
      "Save & share the plan first to connect your own Garage 61 account to it.",
    tokenExplainPre: "Paste a Garage 61",
    tokenExplainBold: "personal access token",
    tokenExplainPost:
      "(create one at garage61.net/developer). It’s encrypted, stored with this plan only, and never shown again — everyone on the plan can then pull with it, but only you (the creator) can change it.",
    tokenPlaceholder: "Garage 61 token",
    connect: "Connect",
    connecting: "Connecting…",
    team: "Team",
    selectTeam: "— Select team —",
    applyChangesTitle: "What “Apply to plan” changes",
    notOnRoster: (driver: string, laps: number) =>
      `${driver} — ${laps} laps, not on this plan’s roster (ignored)`,
    kept: (value: string) => `${value} (kept — yours)`,
    cleanLaps: (n: number) => `(${n} clean laps)`,
    pace: "pace",
    fuelWord: "fuel",
    projectedNote: (delta: string) =>
      `Pace is projected to the plan’s track temperature (${delta} s/lap vs the temperature these laps were set at), which is why it differs from the raw race pace of the laps.`,
    standardSummary: (lap: string, fuel: string, laps: number) =>
      `Standard profile → ${lap} · ${fuel} L/lap (${laps} clean laps)`,
    tempFit: (per10: string, min: string, max: string) =>
      `temp fit ${per10} s/10°C (${min}–${max}°C)`,
    tempFlat: (temp: number) => `all ~${temp}°C (no temp spread)`,
    applyToPlan: "Apply to plan",
  },
  // ---- Drivers table (pace, fuel, wear per driver) ----------------------
  drv: {
    title: "Drivers",
    emptyPre: "No drivers on this plan yet — add them in the",
    emptyRoster: "Roster",
    emptyPost: "box at the top of the page.",
    leadPre: "This table is what the schedule runs on.",
    leadPace: "Pace",
    leadAnd: "and",
    leadFuel: "L/lap",
    leadMid:
      "decide how long each driver’s stint lasts and how many laps come out of a tank. Type in any cell and the schedule below updates on the spot — there is nothing to apply. Garage 61 only",
    leadPrefills: "pre-fills",
    leadMid2: "these fields:",
    leadGreen: "green",
    leadMid3: "came from the data,",
    leadAmber: "amber",
    leadPost:
      "is a figure you typed (a new pull leaves it alone; ↺ hands the row back to the data).",
    gapsPre: "Running on the",
    gapsBold: "Standard profile",
    gapsMid: ", not their own numbers:",
    gapsPost: ". Their stints are marked",
    gapsEst: "est",
    gapsPost2: "in the schedule.",
    applyG61To: (n: number) => `Apply Garage 61 to ${n} ${n === 1 ? "driver" : "drivers"}`,
    fixableNote: (names: string) =>
      `Garage 61 has laps for ${names} — the figures are sitting in those cells as a placeholder, but a placeholder is not a value.`,
    manualOnlyNote: (names: string) =>
      `No Garage 61 laps for ${names} — type their pace and fuel by hand, or pull again with a wider window.`,
    colDriver: "Driver",
    colLaps: "Laps",
    colLapsHint: "Clean laps Garage 61 measured for this driver on this track + car.",
    colBest: "Best",
    colBestHint: "Fastest clean lap in the Garage 61 data.",
    colAvg: "Ø lap",
    colAvgHint:
      "Mean of the driver's clean laps — how they really run, not their one hot lap.",
    colTemp: "°C",
    colTempHint: "Track temperature the Garage 61 laps were set at.",
    colPace: "Pace",
    colPaceHint:
      "Race pace used by the planner. Filled from Garage 61 (median clean lap, projected to the plan's track temp) — type to override.",
    colFuel: "L/lap",
    colFuelHint: "Fuel per lap used by the planner. Filled from Garage 61 — type to override.",
    colWear: "%/lap",
    colWearHint:
      "Tyre wear in % per lap. Garage 61 does not measure this, so it is yours to enter; blank falls back to the plan default.",
    colFsSec: "FS +s",
    colFsSecHint:
      "Seconds per lap THIS driver gives up on a fuel-save stint, added to their own pace. Blank = the plan default (the gap between the Standard and Fuel-saving profiles).",
    colFsFuel: "FS −L",
    colFsFuelHint:
      "Litres per lap THIS driver saves on a fuel-save stint, taken off their own consumption. Blank = the plan default.",
    colRange: "Range/stint",
    colRangeHint:
      "How far this driver gets on one tank: laps, and how long that takes at their pace including the race-traffic penalty (dry).",
    colLapsTotal: "Laps tot.",
    colLapsTotalHint: "Laps this driver runs in the current schedule.",
    colStints: "Stints",
    colStintsHint: "Stints this driver runs in the current schedule.",
    tempCellHint: (span: string) =>
      `Track temperature of this driver's Garage 61 laps${span}`,
    tempCellSpan: (min: string, max: string, fit: string) =>
      ` — the import spans ${min}–${max}°C${fit}`,
    tempCellFit: (per10: string) => `, fitted at ${per10} s per 10°C`,
    ownFigure: "Your own figure — a Garage 61 pull will not overwrite it.",
    fromG61Pace: "From Garage 61 (or blank = Standard profile pace).",
    fromG61Fuel: "From Garage 61 (median of the clean laps).",
    wearHint:
      "Tyre wear in % per lap. Not measured by Garage 61 — read it off the car or leave blank for the plan default.",
    fsSecCellHint: "Seconds/lap this driver gives up when saving fuel. Blank = the plan default.",
    fsFuelCellHint: "Litres/lap this driver saves when saving fuel. Blank = the plan default.",
    evenShareHint: (laps: number) => `An even share would be ~${laps} laps each`,
    resetHint: "Drop your own figures and let the next Garage 61 pull fill them again",
    removeDriver: "Remove driver",
    teamRow: "Team",
    weightedHint: "Weighted by the laps each driver runs",
    defaultWear: "Default tyre wear (%/lap)",
    defaultWearPlaceholder: "0 = off",
    defaultWearNote:
      "Used for drivers with no %/lap of their own. Nobody measures this for you — Garage 61 records the compound, never the wear — so it is yours to judge, per driver where they differ.",
    dataPrefix: "Data:",
    dataSessionExport: "session export",
    dataG61: (window: string) => `Garage 61${window ? ` · ${window}` : ""}`,
    dataCleanLaps: (n: number) => `${n} clean laps`,
    dataTooOld: (n: number) => ` · ${n} older left out`,
    dataPulled: (day: string) => ` · pulled ${day}`,
    evenSharePre: "Even share:",
    evenShareValue: (laps: number) => `${laps} laps`,
    evenSharePost: "per driver — anyone under 85 % of it is flagged amber.",
    trafficNote: (sec: number) => `Range includes +${sec} s/lap race traffic.`,
    paceAt: (temp: string, fit: string) =>
      `Pace is at ${temp} °C${fit}; per-stint temperatures, ½ wet and wet are applied in the schedule.`,
    paceFit: (per10: string) => ` (${per10} s/10 °C fit)`,
    footer:
      "Drivers come from CLS — anyone with a registration. Tyre wear is not something Garage 61 measures (it records the compound, never the wear), and neither is a fuel-save delta, so those columns are always yours to judge.",
  },
  // ---- Availability & stint preferences ---------------------------------
  avail: {
    title: "Availability & stint preferences",
    lead1:
      "Everyone is available by default — untick an hour to mark a driver unavailable. Stint driver & spotter menus only offer drivers available for that stint’s hour.",
    lead2Pre: "The columns on the right are what each driver would",
    lead2Em: "rather",
    lead2Mid: "do. They are used by",
    lead2Bold: "Auto-fill drivers",
    lead2Post:
      "only — a seat you pick by hand and a correction during the race ignore them completely. They are also wishes, not rules: the fill will break one rather than leave a stint empty, and it says so afterwards.",
    nightFrom: "Night counts from",
    nightTo: "to",
    nightNote:
      "o’clock, real time on your clock — not the sim’s time of day.",
    nightNoStart: "Set a Race start above, or night cannot be worked out at all.",
    colDriver: "Driver",
    hourLabel: (h: number) => `Hour ${h}`,
    hourShort: (h: number) => `H${h}`,
    colNight: "Night",
    colNightHint: "Driving in the real-world night, in the window set above.",
    colRain: "Rain",
    colRainHint: "Stints marked half wet or wet in the schedule.",
    colStart: "Start",
    colStartHint: "Being in the car when the flag drops.",
    colMaxRow: "Max row",
    colMaxRowHint: "Most stints in a row this driver wants. Empty = no limit.",
    prefHint: (what: string) => `Would they rather drive ${what}, or rather not?`,
    prefNight: "at night",
    prefRain: "in the wet",
    prefStart: "the start",
    prefHappy: "happy to",
    prefAvoid: "rather not",
    availCell: (driver: string, hour: number) => `${driver} — Hour ${hour}`,
    maxRowHint: (driver: string) =>
      `Most stints in a row ${driver} wants. Empty = no limit.`,
    fillTitle: (drivers: number, fair: string) =>
      `Last auto-fill — ${drivers} driver${drivers === 1 ? "" : "s"}, fair share ${fair} stints each`,
    fillAllHonoured: "every preference honoured",
    fillStints: (n: number) => `${n} stint${n === 1 ? "" : "s"}`,
    fillLongestRun: (n: number) => ` · up to ${n} in a row`,
    fillNight: (n: number) => ` · ${n} at night`,
    fillRain: (n: number) => ` · ${n} wet`,
    fillTakesStart: " · takes the start",
    fillBroken: (wishes: string) => `against their wish: ${wishes}`,
    fillUnavailable: (n: number, stints: string) =>
      `${n} stint${n === 1 ? "" : "s"} had to go to a driver marked unavailable (stint ${stints}) — there was nobody else.`,
    fillUnfilled: (stints: string) => `Nobody could take stint ${stints}.`,
  },
  // ---- preferences the automatic line-up had to break -------------------
  wish: {
    nightStints: (n: number) => `${n} night stint${n === 1 ? "" : "s"}`,
    noNightStint: "no night stint",
    wetStints: (n: number) => `${n} wet stint${n === 1 ? "" : "s"}`,
    noWetStint: "no wet stint",
    takesStart: "takes the start",
    notOnStart: "not on the start",
    runTooLong: (n: number) => `${n} stints in a row`,
    doubleAgainstWish: "a double stint",
    tripleAgainstWish: "a triple stint",
    outsideAvailability: (n: number) =>
      `${n} stint${n === 1 ? "" : "s"} outside their availability`,
  },
  // ---- During-race summary + live banner --------------------------------
  live: {
    stints: "Stints",
    pitStops: "Pit stops",
    totalLaps: "Total laps",
    totalFuel: "Total fuel",
    drivers: "Drivers",
    projectedFinish: "Projected finish",
    fairShare: (stints: string) =>
      `Fair share ≈ ${stints} stints each. “Projected finish” is the race-clock time the plan currently ends at — it moves away from the race length as you enter ± corrections during the race.`,
    greenFlagIn: "● Green flag in",
    greenFlagLabel: "Green flag",
    greenFlagNotStamped: "not stamped yet",
    greenFlagPress: "Press it the moment the flag falls — the whole plan shifts with it.",
    raceFinished: "● Race finished",
    liveStint: (index: number, driver: string) =>
      `● LIVE — Stint ${index}${driver ? ` · ${driver}` : ""} · next pit in`,
    liveOnly: "● LIVE",
    notesPre: "Pre-Race notes",
    notesDuring: "Race notes",
    notesPost: "Debrief notes",
  },
  // ---- The schedule: the plan itself ------------------------------------
  sched: {
    title: "Stint schedule & pit timeline",
    showSpotter: "Show spotter",
    hideSpotter: "Hide spotter",
    spotterToggleHint:
      "The spotter column is hidden by default — it is the widest column nobody reads twice.",
    rainFrom: "☔ Rain from stint",
    rainFromHint: "Mark this stint and every later stint with the chosen condition.",
    halfWetBtn: "½ wet",
    halfWetBtnHint: "Damp / drying from this stint on",
    wetBtn: "Wet",
    wetBtnHint: "Full wet from this stint on",
    allDry: "All dry",
    allDryHint: "Clear all wet flags",
    tempRamp: "🌡 Temp ramp",
    tempRampHint:
      "Fill every stint with a track-temperature ramp: start → peak → end. Leave the peak empty for one straight line. Correct single stints afterwards.",
    tempStart: "start",
    tempStartHint: "Track temperature at the green flag",
    tempPeak: "peak",
    tempPeakHint:
      "Hottest track temperature of the race — leave empty for a straight start-to-end ramp",
    tempPeakAt: "@#",
    tempPeakAtHint: "Stint the peak falls in (default: the middle stint)",
    tempEnd: "end",
    tempEndHint: "Track temperature at the chequered flag",
    clearTemps: "Clear",
    clearTempsHint: "Clear every per-stint temperature (back to the plan's Track temp)",
    discordAlert: "🔔 Discord alert",
    discordAlertHint:
      "Send the driver of the next stint a Discord DM before they are due in the car. Needs a session start and a Discord account linked in CLS.",
    alertLeadHint: "Minutes before the stint starts",
    minBefore: "min before",
    testAlert: "Test",
    sendingAlert: "Sending…",
    testAlertHint:
      "Send the DM for the next upcoming stint right now — a live test of the whole chain",
    nothingDue: "Nothing due — no stint starts within reach.",
    autoFill: "Auto-fill drivers",
    autoFillHint:
      "Fill every seat automatically: even shares, availability respected and the stated preferences honoured where possible. It reports afterwards what it had to break.",
    clearAssignments: "Clear",
    clearAssignmentsHint: "Empty every seat — the stints themselves stay.",
    saveFirstForAlerts: "Save the plan first — the alerts run against the saved plan.",
    emptyState:
      "Enter a race duration, lap time, fuel per lap and tank size to generate the schedule.",

    colNum: "#",
    colDriver: "Driver",
    colSpotter: "Sp.",
    colSpotterHint: "Spotter for this stint — initials; the full name is on hover.",
    colProfile: "Profile",
    colProfileHint:
      "Std runs this stint at the driver's normal pace, FS at their fuel-save pace — slower per lap, but fewer litres.",
    colRaceStart: "Race start",
    colClockIn: "Clock in",
    colRaceEnd: "Race end",
    colCorrection: "±min",
    colCorrectionHint: "Live correction in minutes (±). Cascades to later stints.",
    colLength: "Length",
    colLap: "Lap",
    colLapHint:
      "The lap time this stint was computed with: the driver's own pace plus the temperature, weather and traffic penalties. Everything else in the row follows from it.",
    colLaps: "Laps",
    colLapsHint:
      "Laps this stint runs. Type a number to overrule the model — pitted early after damage or a shortcut, or stayed out a lap longer. Clear the field to hand it back to the model.",
    colFuel: "Fuel",
    colLeft: "Left",
    colLeftHint:
      "Fuel left in the tank when the stint ends, above the reserve. This is what the stop has to put back in.",
    colFull: "Full",
    colFullHint:
      "Fill the tank at the stop that ends this stint. Untick to take a set number of litres — a splash: shorter stop, shorter next stint.",
    colFillL: "Fill L",
    colFillLHint:
      "Litres taken at the stop that ends this stint. Only editable when 'Full' is unticked.",
    colTyres: "🛞",
    colTyresHint: "Change tyres at that stop? Unticked keeps the set for the next stint.",
    colTyrePct: "Tyre %",
    colTyrePctHint: "Tyre condition at the end of this stint.",
    colStop: "Stop",
    colStopHint:
      "What that stop costs: lane loss + fuel + tyres + any uncovered driver change.",
    colTemp: "°C",
    colTempHint:
      "Track temperature for this stint. Empty = the plan's Track temp, i.e. exactly the entered pace.",
    colTrack: "Track",
    colTrackHint:
      "Track condition for this stint: dry, half wet (damp/drying) or full wet. Each adds its own penalty per lap.",
    colNote: "Note",

    fin: "fin",
    profileStd: "Std",
    profileFs: "FS",
    spotterOf: (name: string) => `Spotter: ${name}`,
    noSpotter: "No spotter for this stint",
    nightWindow: (from: string, to: string) =>
      `Starts in the night window (${from}:00–${to}:00 your time)`,
    est: "est",
    estHint: (what: string) =>
      `No own ${what} for this driver — the Standard profile was used.`,
    estPaceFuel: "pace or fuel figure",
    estPace: "pace",
    estFuel: "fuel figure",
    lapsOverridden:
      "Typed in by hand — the model is overruled for this stint. Clear the field to give it back.",
    lapsFromModel:
      "Laps from the model. Type a number to overrule it (pitted early, shortcut, a lap longer).",
    fuelShortMark: "More laps than the fuel on board allows — the car does not get that far.",
    shortFill: "short",
    shortFillHint: "Short stint — the previous stop was only a splash",
    fuelShortLeft: "The stint burns more than it started with — it cannot be run on this fuel.",
    tankAtFlag: (start: string, end: string) =>
      `Tank at the flag: ${start} L → ${end} L (above the reserve)`,
    condDry: "dry",
    condHalf: "½ wet",
    condWet: "wet",
    notePlaceholder: "…",
    cellFull: "Fill the tank at this stop. Untick for a splash.",
    cellFillL: "Litres at this stop.",
    cellTyres: "Change tyres at this stop",
  },

  // ---- the Lap-column tooltip -------------------------------------------
  lapBreak: {
    profilePace: "(profile pace)",
    driver: (name: string) => `(${name})`,
    driverFallback: (name: string) => `(${name} — no pace of their own, Standard profile)`,
    atTemp: (temp: number) => `at ${temp}°C`,
    temperature: "temperature",
    fullWet: "full wet",
    halfWet: "half wet",
    traffic: "race traffic",
    perLap: (lap: string) => `= ${lap} per lap`,
    fuelLine: (fuel: string) => `${fuel} L/lap`,
    fuelFallback: " (Standard profile — this driver has no fuel figure)",
  },

  // ---- Per-driver totals table ------------------------------------------
  totals: {
    title: "Per-driver totals",
    colDriver: "Driver",
    colStints: "Stints",
    colDriveTime: "Drive time",
    colLaps: "Laps",
    colFuel: "Fuel",
  },
  schedCell: {
    tempDelta: (delta: string) => `${delta} s/lap vs the plan's base temperature`,
    tempBlank: "Track temperature for this stint (blank = base temp)",
    weatherDelta: (sec: string) => `+${sec} s/lap for this stint`,
    conditionPlain: "Track condition for this stint",
    notePlaceholder: "incident, weather, SC…",
  },
  // ---- After the race: poster, race log, event result -------------------
  post: {
    galleryTitle: "Poster & impressions",

    logTitle: "Race log (pace & stints)",
    logParsing: "Parsing…",
    logReplace: "Replace race-log .jsonl",
    logUpload: "Upload race-log .jsonl",
    logEmptyPre: "Upload the race-logger",
    logEmptyPost:
      "from the session to see the pace each driver actually ran, the real stint lengths and pit-stop times — and to feed those numbers straight back into the plan.",
    logCarNumber: (n: string) => `car #${n}`,
    logTrackTemp: (c: number) => `track ${c} °C`,
    logClassBest: (lap: string) => `class best ${lap}`,
    logUsePace: "Use measured pace for drivers",
    logUseTemp: "Use track temp",
    logRemove: "Remove",
    logOldEventResultPre: "This event result was uploaded before team-driver splitting existed. Upload the",
    logOldEventResultPost: "again to break the log down per driver.",
    logNoTimestamps:
      "This log was analysed before lap timestamps were stored, so it can't be matched to the driver order in your stint schedule — the dashboard is falling back to a reconstruction. The raw file is still archived; one click fixes it.",
    logOldAverage:
      "This log was analysed before the average learned to leave out the formation and start laps, the laps under a full-course yellow and the restart lap — right now only the in and out laps are dropped. The raw file is still archived; one click re-runs the whole analysis.",
    logReanalysing: "Re-analysing…",
    logReanalyse: "Re-analyse log",
    logNeedEventResultPre: "For a team race, also upload the",
    logNeedEventResultPost:
      "above — the race logger records only one driver name per car, so the split per team driver comes from there.",

    resultTitle: "Event result",
    resultParsing: "Parsing…",
    resultReplace: "Replace eventresult.json",
    resultUpload: "Upload eventresult.json",
    resultEmptyPre: "After the session, upload the iRacing",
    resultEmptyPost:
      "to archive it with this plan and show the finishing order. Team events are listed per team; your own entry is highlighted.",
    resultRemove: "Remove",
    colPos: "Pos",
    colClass: "Class",
    colClassPos: "Cls",
    colNumber: "#",
    colTeam: "Team / drivers",
    colDriver: "Driver",
    colCar: "Car",
    colLaps: "Laps",
    colBest: "Best",
    colInc: "Inc",
    showAll: (n: number) => `Show all ${n} entries`,
    showOurClass: "Show our class only",
  },
  // ---- status / error messages ------------------------------------------
  msg: {
    staleReloadUpload:
      "The site was updated while this tab was open — reload the page, then upload again.",
    staleReloadRetry:
      "The site was updated while this tab was open — reload the page, then try again.",
    staleReloadSave:
      "The site was updated while this tab was open — reload the page, then save again.",
    uploadFailed: "Upload failed — please try again.",
    reanalyseFailed: "Re-analysing failed — please try again.",
    saveFailed: "Saving failed — please try again.",

    raceStartStamped:
      "Green flag stamped — the whole plan now runs from this second.",

    resultParsed: (n: number, teams: boolean) =>
      `Eventresult parsed — ${n} ${teams ? "teams" : "drivers"}. Saved with the plan.`,
    logParsed: (carNumber: string) =>
      `Race log parsed — stints of car #${carNumber}. Saved with the plan.`,
    logParsedNoCar:
      "Race log parsed. (No car matched this plan's drivers, so no stint breakdown.)",
    logReanalysed: "Race log re-analysed with the current parser.",
    logPaceApplied: "Driver lap times set from the race log.",
    logTempApplied: (c: number) => `Track temperature set to ${c} °C from the race log.`,

    fsApplied: (
      stops: number,
      lap: string,
      fuel: string,
      outcome: string,
      paceNote: string
    ) =>
      `Applied to Standard profile: ${stops} stops · target ${lap} @ ${fuel} L/lap → ${outcome}${paceNote}.`,
    fsOutcomeTime: (time: string, laps: number) => `${time} for ${laps} laps`,
    fsOutcomeLaps: (laps: string) => `${laps} laps`,

    g61NoLapData: "No lap data found — is this a Garage 61 session export (.xlsx)?",
    g61NoMatch: (laps: number, seen: string) =>
      `None of the ${laps} laps in the file were driven by your plan's drivers. The file has: ${seen}. Match the names, or add the driver to the plan.`,
    g61NoDriverName: "no driver name",
    g61NoCleanLap: (laps: number) =>
      `Found ${laps} laps, but no clean full lap among them — in/out laps, partials and laps without fuel data can't be used. Drive a few consecutive green laps.`,
    g61Added: (added: number, total: number, imports: number) =>
      `Added ${added} lap${added === 1 ? "" : "s"} to the pool — now ${total} laps from ${imports} import${imports === 1 ? "" : "s"}.`,
    g61Duplicate:
      " This file was already in the pool, so it replaced the earlier copy instead of counting twice.",
    g61Evicted: (n: number, cap: number, names: string) =>
      ` Oldest import${n === 1 ? "" : "s"} dropped to stay under ${cap} laps: ${names}.`,
    g61FileRead: "Could not read the file — is it a valid .xlsx export?",
    g61Applied: (matched: number, tempNote: string) =>
      `Applied to the driver table: pace + fuel/lap for ${matched} driver${matched === 1 ? "" : "s"}.${tempNote} Save keeps it.`,
    g61SourceRemoved: (laps: number, imports: number) =>
      `Import removed — recomputed from ${laps} laps across ${imports} import${imports === 1 ? "" : "s"}. Apply to plan to write the new figures into the driver table.`,
    g61SourceRemovedEmpty: "Import removed — no clean laps left in the pool.",
    g61ClearedWithFigures:
      "Garage 61 data cleared, including the pace and fuel it had filled in. Figures you typed yourself were kept. Save to make it permanent.",
    g61Cleared:
      "Garage 61 data cleared. The pace and fuel already in the driver table stayed — they are the plan's numbers now. Save to make it permanent.",
    g61NeedTrack: "Select a Track above first — the live pull uses the event Track and Car.",
    g61PullFailed: "Live pull failed — please try again.",
    g61PullTrackFallback: "track",
    g61Pulled: (laps: number, source: string, window: string) =>
      `Pulled ${laps} lap${laps === 1 ? "" : "s"} from Garage 61 (${source}, ${window})`,
    g61PulledTooOld: (n: number) =>
      ` · ${n} older lap${n === 1 ? "" : "s"} left out`,

    g61NeedToken: "Paste your Garage 61 personal access token first.",
    g61ConnectedPickTeam: "Connected. Pick which team to pull from below.",
    g61ConnectedOk: "Connected ✓",
    g61ConnectFailed: "Couldn't connect — please try again.",
    g61Disconnected: "Disconnected.",

    pitApplied: "Measured values are in this plan's pit-stop model.",
    pitLibraryIncomplete:
      "The library needs all three: lane loss, refuel rate and tyre time. Label the missing stop kinds, or drive the missing stop.",
    pitLibrarySaved: (car: string, track: string) =>
      `Saved to the library for ${car}${track ? ` @ ${track}` : ""}.`,

    tempRampNeedEnds: "Enter at least a start and an end temperature for the ramp.",
    tempRamped: (from: string, to: string, stints: number) =>
      `Track temperature ramped ${from} °C → ${to} °C across ${stints} stints.`,
    tempRampedPeak: (from: string, peak: string, at: number, to: string, stints: number) =>
      `Track temperature ramped ${from} → ${peak} °C at stint ${at} → ${to} °C across ${stints} stints.`,

    galleryMax: (max: number) => `Only ${max} pictures per plan.`,
    gallerySkipped: (names: string) => `Skipped: ${names}.`,
    posterSaved: "Poster saved with the plan.",
    picturesAdded: (n: number) => `${n} picture${n === 1 ? "" : "s"} added.`,

    savedCopied: "Saved — share link copied to clipboard.",
    savedNoClipboard: "Saved. Share link is in the address bar.",
  },
  msgPull: {
    noDates: " · laps carry no date, so only the season filter applied",
    addedToPool: (laps: number, imports: number) =>
      ` · added to the pool: ${laps} laps from ${imports} import${imports === 1 ? "" : "s"}`,
    replacedDuplicate: " (this pull replaced an identical earlier one)",
    dropped: (names: string) => ` · dropped: ${names}`,
    reviewThenApply: ". Review below, then Apply to plan.",
    reviewThenApplySpaced: " Review below, then Apply to plan.",
  },
  // ---- the plan list at /stint-planner ----------------------------------
  index: {
    title: "Stint Planner",
    lead:
      "Fuel, stint and driver-rotation plans for iRacing Special Events. You see the plans you created, the ones you are driving in and the ones you were added to.",
    guide: "📖 Guide (German)",
    newPlan: "+ New plan",
    emptyPre: "No stint plans for you yet.",
    emptyLink: "Create the first one →",
    activeTitle: "Active plans",
    activeEmptyPre: "Nothing running right now —",
    activeEmptyLink: "start a new plan",
    completedTitle: "Completed",
    completedLead:
      "Races that are done. The plan is read-only, the analysis stays open — open one and reopen it if you need to change something.",
    completedBadge: "completed",
    driverCount: (n: number) => `${n} drivers`,
    noAccessTitle: "This plan isn’t shared with you",
    noAccessBodyPre:
      "A stint plan can only be opened by the driver who created it, the drivers in it, the people they added and CLS admins. If you should be in it, ask whoever built the plan to add you — there is a",
    noAccessBox: "Who can open this plan",
    noAccessBodyPost: "box on their side.",
    backToPlans: "← Your stint plans",
  },
  // ---- page chrome around the planner -----------------------------------
  page: {
    allPlans: "← All stint plans",
    newTitle: "New Stint Plan",
    newLead:
      "Fuel, stints and driver rotation for an iRacing Special Event. Enter the race length, lap time, fuel per lap and tank size — add drivers from CLS and assign one to each stint, then save. The saved plan is yours: you, the drivers you put in it and anyone you add can open it.",
    planTitle: "Endurance Stint Planner",
    planLeadArchived:
      "Completed plan — the race is done, so the plan itself is frozen. The debrief below stays open.",
    planLeadLive:
      "Shared stint plan — live for everyone on it. Changes save automatically and everyone’s view refreshes within a few seconds.",
    debriefLink: "Team debrief →",
  },
  // ---- "Who can open this plan" -----------------------------------------
  access: {
    title: "🔒 Who can open this plan",
    count: (n: number) => `${n} ${n === 1 ? "person" : "people"} + admins`,
    hide: "hide",
    show: "show",
    lead:
      "A stint plan is private. The driver who created it, everyone in the line-up and the people added below can open and edit it — nobody else, even with the link. CLS admins can always get in.",
    createdBy: "Created by",
    ownerUnknown:
      "Not recorded — this plan is older than the access rules. The drivers in it (and admins) can open it.",
    driversTitle: "Drivers in the plan",
    driversEmpty:
      "No CLS drivers in the line-up yet — add drivers below in the planner and they get access automatically.",
    extraTitle: "Also allowed in",
    extraEmpty: "Nobody yet.",
    removePerson: (name: string) => `Remove ${name}`,
    addPlaceholder: "🔍 Add someone who isn’t driving — type a name…",
    addNote: "Team boss, spotter, engineer — same rights as a driver.",
  },
  // ---- poster / impressions gallery + list-row buttons ------------------
  gallery: {
    posterTitle: "Result poster / certificate",
    uploading: "Uploading…",
    replacePoster: "Replace poster",
    uploadPoster: "Upload poster",
    posterAlt: "Result poster",
    captionPlaceholder: "Caption (optional) — e.g. P8 in class, LMP2",
    captionShort: "Caption…",
    remove: "Remove",
    posterEmpty:
      "Upload the official certificate or your own result poster — it stays with the plan and everyone on the share link sees it.",
    impressionsTitle: "Impressions from the race",
    limitReached: (max: number) => `Limit ${max} reached`,
    addPictures: "Add pictures",
    fullSize: "Full size",
    closeEsc: "Close (Esc)",
    duplicate: "Duplicate",
    duplicating: "Copying…",
    duplicateHint: "Copy this plan — same setup, drivers and pit values, empty schedule.",
    deletePlan: "Delete",
    deleting: "Deleting…",
    deleteHint: "Delete this plan (admin only)",
    deleteConfirm: (title: string) => `Delete "${title}"? This cannot be undone.`,
  },
  // ---- Garage 61 driver-performance dashboard ---------------------------
  perf: {
    title: "Driver performance",
    cleanLaps: (n: number) => `${n} clean laps`,
    tempFit: (per10: string) => ` · ${per10} s/10°C fit`,
    colDriver: "Driver",
    colLaps: "Laps",
    colBest: "Best",
    colMedian: "Median",
    colGap: "Δ fastest",
    colConsistency: "Consistency (σ)",
    colFuel: "Fuel/lap",
    fastest: "fastest",
    wetTitle: "Wet weather",
    wetSummary: (laps: number, min: number, max: number, delta: string) =>
      `${laps} wet laps · ${min}–${max}% wet${delta}`,
    wetDelta: (sec: string) => ` · +${sec}s/lap vs dry`,
    colWetLaps: "Wet laps",
    colWetPace: "Wet pace",
    wetNote:
      "Wet pace is highly variable (line, standing water, tyres) — treat as a rough reference. Use the Dry/Wet toggle in Event to re-plan the race at wet pace.",
    paceTitle: "Pace & consistency",
    paceNote: (temp: string) =>
      `Box = middle 50% of laps, line = median, dot = best. Tighter box = more consistent. Normalised to ${temp}.`,
    paceNoteOneTemp: "one temp",
    fuelTitle: "Fuel per lap",
    fuelNote: "Median fuel burned on clean laps — lower can drop a pit stop.",
    scatterTitle: "Lap time vs track temp",
    scatterEmpty:
      "Not enough laps across different track temperatures to plot the temperature relationship yet.",
    scatterNote: (trend: string) =>
      `Each point is a clean lap shown as its gap to that driver’s own median, so drivers overlay. Dashed line = the fitted temperature trend${trend}.`,
    scatterTrend: (per10: string) => ` (${per10} s/10°C)`,
  },
  // ---- race-log dashboard ------------------------------------------------
  rlog: {
    noLapData: "No lap data for our car in this log.",
    planDisagreesTitle: "The stint plan does not match what iRacing scored.",
    planDisagreesBody: (driver: string, delta: number | string) =>
      `Going by the plan, ${driver} would have ${delta} laps more or fewer than the results credit him with — which is what a swapped stint looks like when someone stepped in for a team mate and the plan was never changed. The drivers below therefore come from the RESULTS, not from the plan. If that is still wrong, set the driver by hand in the stint table.`,
    aDriver: "a driver",
    overridden: (n: number) =>
      `${n} stint${n === 1 ? "" : "s"} assigned by hand — those beat both the plan and the reconstruction.`,
    teamEventTitle: "Team event.",
    teamEventPre: "Laps, best lap, average lap and incidents come from the",
    teamEventMid:
      "— iRacing’s own per-driver scoring. The race logger records only one driver name per car, so who drove which stint comes from",
    teamEventPlanBold: "your stint schedule above",
    teamEventPlanPost:
      "— each real stint is matched to the planned stint it overlaps in time, live ± corrections included.",
    teamEventInferredPre: "a",
    teamEventInferredEm: "reconstruction",
    teamEventInferredPost:
      "from each driver’s fastest-lap number and lap count. Assign the drivers in the stint schedule above and this becomes exact.",
    notConfident:
      "The reconstruction did not match every driver’s lap count exactly — treat the stint assignment as a best guess.",

    bestLap: "best lap",
    laps: "Laps",
    average: "Average",
    cleanAvg: "Ø clean",
    cleanAvgHint:
      "Average over this driver's racing laps only — the lap into the pits and the lap back out are left out, so a double stint and a repair stop no longer make a driver look slow.",
    cleanCell: (kept: number, dropped: number, why: string) =>
      `${kept} racing laps, ${dropped} ignored${why ? ` (${why})` : ""}`,
    cleanCellNone: "No racing laps left after removing the in/out laps",
    incidents: "Incidents",
    greenPace: "Green pace",
    target: (iRating: number | string) => `Target (${iRating} iR)`,
    targetHint: (iRating: number | string) =>
      `Read off the pace curve at this driver's own ${iRating} iRating.`,
    spread: "Spread",
    stints: "Stints",
    footnotePlan:
      "* measured from the log, split by the driver order in your stint schedule.",
    footnoteInferred: "* derived from the reconstructed stint split.",

    gapBest: "Best lap — gap to class best",
    gapAvgTarget: "Average lap — gap to your own iRating’s target",
    gapAvg10k: "Average lap — gap to the 10k reference",
    gapAvgClass: "Average lap — gap to class best",
    noteTemp: (
      baseTemp: string,
      slope: string,
      corrected: number,
      skipped: string,
      source: string
    ) =>
      `Racing laps only, then every lap shifted to ${baseTemp} °C at the plan's measured ${slope} s per degree — so the man who drove the hot opening stint can be compared with the man who had the cool night. ${corrected} laps corrected${skipped}. Temperatures come from ${source}.`,
    noteTempSkipped: (n: number) => `, ${n} left out for carrying no temperature`,
    noteTempFromLog: "the race logger's own samples",
    noteTempFromPlan: "the per-stint figures typed on the pit wall",
    noteCleanMarked: (dropped: string) =>
      `Average over racing laps only — the formation and start laps, the lap into the pits and the lap back out, every lap under a full-course yellow and the restart lap after it are all left out${dropped}. A local waved yellow is not a caution and does not remove a lap.`,
    noteCleanDropped: (n: number, why: string) =>
      ` (${n} laps${why ? `: ${why}` : ""})`,
    noteCleanOld: (dropped: string) =>
      `Average over racing laps: the lap into the pits and the lap back out are ignored${dropped}. This log was analysed before the formation, start and full-course-yellow laps were recognised — press Re-analyse above to apply those too.`,
    noteCleanOldDropped: (n: number) => ` (${n} laps)`,
    noteIracing:
      "iRacing's average over every lap the driver completed, so pit, caution and repair laps are in it.",
    cycleHintTemp:
      "Cycle: clean average → corrected to one track temperature → iRacing's own average.",
    cycleHintNoTemp:
      "Switch between the clean average (in/out laps removed) and iRacing's own average. A temperature-corrected average needs a measured °C slope on the plan.",
    modeTemp: "Ø temp-corrected",
    modeIracing: "iRacing Ø",
    extraTargets: (ref: string) =>
      `Each bar is that driver's own yardstick: the lap his iRating was worth here, read off the pace curve. A short bar means he drove above his rating${ref}.`,
    extraTargetsRef: (lap: string) =>
      `; the fixed 10k reference for this track is ${lap}`,
    extraNoRatings:
      "No iRatings in the results file yet — upload the eventresult.json and every driver gets his own target. Until then the fixed reference (or the class best) is used for everyone.",
    extraNoCurve:
      "No pace curve chosen for this plan, so everyone is measured against the same number. Pick one in the Event card to get per-driver targets.",
    lapsDriven: "Laps driven",
    incPerStint: "Incidents per stint",
    incPerStintNote:
      "Bar length is incidents ÷ stints. Comparing raw totals punishes whoever was in the car longest — a driver with four stints and 4x is as clean as one with two stints and 2x.",
    incUnknownStints: (inc: number) => `${inc}x — stints unknown`,
    incRate: (rate: string, inc: number, stints: number) =>
      `${rate}/stint — ${inc}x in ${stints} stint${stints === 1 ? "" : "s"}`,
    incNone: "No incidents — clean race.",
    incNotRecorded:
      "Not recorded. This log carries no incident data — the race logger takes incidents from the broadcast dashboard, and it was not running. Upload the eventresult.json for iRacing's own count, or use a newer RaceLogger, which reads the count itself.",

    traceTitle: "Lap times over the race",
    badgeFromPlan: "drivers from the stint plan",
    badgeReconstructed: "stint split reconstructed",
    aboveScale: (n: number) =>
      `${n} lap${n === 1 ? "" : "s"} above the scale (pit / caution)`,
    allInScale: "all laps in scale",
    classBest: "class best",
    traceAria: "Lap time per lap for each team driver",
    hoverLap: (lap: number) => `Lap ${lap}`,
    unassigned: "unassigned",
    vsClassBest: "vs class best",

    noComparable: "No comparable lap times.",
    gapTo: (name: string, gap: string, baseline: string) =>
      `${name}: ${gap} s off ${baseline}`,
    baselineTarget: (iRating: number | string, lap: string) =>
      `target for ${iRating} iR (${lap})`,
    baseline10k: (lap: string) => `10k reference (${lap})`,
    baselineClass: (lap: string) => `class best (${lap})`,

    stintTableTitle: "Stint by stint",
    stintTableCar: (n: string) => ` — car #${n}`,
    badgePlanShort: "drivers from the plan",
    badgeReconstructedShort: "drivers reconstructed",
    stintBarNote: "bar length = stint pace relative to our best and worst stint",
    colNum: "#",
    colLaps: "Laps",
    colDriver: "Driver",
    colStintPace: "Stint pace",
    colPit: "Pit",
    stintDriverHint:
      "Who actually drove this stint. Set it only when the automatic answer is wrong — a hand correction beats the plan and the reconstruction, and it is saved with the plan.",
    autoDriver: (name: string) => `automatic — ${name}`,
    autoUnknown: "automatic — unknown",
    stintPaceHint: (index: number, lap: string) => `Stint ${index}: ${lap}`,

    exFormStart: (n: number) => `${n} formation/start`,
    exInOut: (n: number) => `${n} in/out`,
    exFcy: (n: number) => `${n} under a full-course yellow`,
    exRestart: (n: number) => `${n} restart`,
  },
  // ---- team debrief (/stint-planner/[id]/debriefing) --------------------
  dbf: {
    title: "Debrief",
    pptx: "⬇ PowerPoint (.pptx)",
    print: "Print / PDF",
    refreshHistory: "Refresh history",
    saving: "Saving…",
    historyRefreshed: (drivers: number) => `History refreshed (${drivers} drivers).`,

    awardsTitle: "Awards (fast and safe)",
    evalTitle: "Evaluation",
    colDriver: "Driver",
    colAllVsClean: "all vs. clean",
    colAllVsPlan: "all vs. forecast",
    colCleanVsBest: "clean vs. best",
    colBestVsRef: "best lap vs. reference",
    colIncPerHour: "Incs/h",
    colRelPerf: "Relative performance",
    col10k: "10k performance",
    colConsistency: "Consistency",
    legendRelPerf: "Relative performance",
    legendRelPerfBody:
      "= the lap time your own iRating was worth here, divided by the best lap actually driven — over 100 % means faster than your own rating.",
    legend10k: "10k performance",
    legend10kBody:
      "measures the same against the fixed 10k reference lap, which makes it comparable across races.",
    legendConsistency: "Consistency",
    legendConsistencyBody:
      "= 1 − σ ÷ Ø over the clean laps, each driver measured against their own laps, never driver against driver.",
    legendIncs: "Incs/h",
    legendIncsBody:
      "instead of total incidents, so whoever took the most stints is not punished for it.",

    trendRelTitle: "Relative performance over time",
    trendConsistencyTitle: "Consistency over time",
    trendSeasonTitle: "Trend over the season",
    trendEmpty:
      "No history yet. It starts as soon as a plan is marked completed — or straight away via “Refresh history” above.",
    trendOne: "One race is in the history. From the second one this becomes a curve.",
    trendScale: (min: string, max: string) =>
      `Same scale in every panel (${min} – ${max}). Races from left to right:`,

    appendixTitle: "Appendix — the raw numbers",
    colAvgAll: "Ø all",
    colAvgClean: "Ø clean",
    colForecast: "Forecast",
    colBestLap: "best lap",
    colReference: "Reference",
    colLaps: "Laps",
    colStints: "Stints",
    colDriveTime: "Drive time",
    colIncs: "Incs",
    colIRating: "iRating",
    appendixRefPre: "Reference =",
    appendixRefOfficial:
      "the lap time of your own iRating from the pace curve, otherwise the fixed 10k reference",
    appendixRefLeague: "the fastest lap in your own class",
    appendixAttrPre: ". The stints were attributed",
    appendixAttrPlan: "from the stint plan",
    appendixAttrLog: "from the race log itself",
    appendixAttrInferred: "from a reconstruction of the results",

    discussionTitle: "Discussion",
    discussionEmpty:
      "No notes yet. The plan’s post-race notes appear here — and the PowerPoint brings an empty discussion slide with the talking points.",

    baselineIrating: (iRating: number | string) => `Target lap for ${iRating} iR`,
    baselineRef10k: "fixed 10k reference",
    baselineClassBest: "fastest lap in class",
    baselineTeamBest: "fastest lap of the team",

    metricIncPerHour: "Incidents per hour",
    noData: "no data",

    teamCountsFor: "Counts towards the team statistic of ",
    teamNone: "no team",
    teamNoneNote: "— none of the drivers is assigned to a team in CLS.",
    teamInferred: (votes: number, matched: number) =>
      `automatically from the drivers (${votes} of ${matched})`,
    teamManual: "set by hand",
    teamCancel: "Cancel",
    teamChange: "Change team",
    teamAuto: "Automatically from the drivers",
    teamSaved: (team: string) =>
      `Saved${team ? ` — now ${team}` : ""}. Reload the page to see it everywhere.`,
  },
  // ---- debrief race charts ----------------------------------------------
  dbfRace: {
    lapTraceTitle: "Lap times over the race",
    timelineTitle: "Stint plan against reality",
    stintByStintTitle: "Stint by stint",
    noLapTimes: "No lap times in the log.",
    reasonForm: "formation lap",
    reasonStart: "start lap",
    reasonIn: "lap into the pits",
    reasonOut: "lap out of the pits",
    reasonFcy: "full-course yellow",
    reasonRestart: "restart",
    excludedLegend: "out of the average (pit, yellow, start)",
    classBestLegend: (lap: string) => `— — fastest lap in class (${lap})`,
    hoverLap: (lap: number, time: string, why: string, at: string) =>
      `Lap ${lap}: ${time}${why}${at}`,
    hoverWhy: (why: string) => ` · ${why}`,
    hoverAt: (clock: string) => ` · at ${clock}`,
    noSessionTimes:
      "The log carries no session times, so the race cannot be laid against the plan.",
    rowPlan: "Plan",
    rowActual: "Actual",
    timelineHover: (
      row: string,
      index: number,
      driver: string,
      from: string,
      to: string,
      laps: string,
      pit: string
    ) => `${row} · Stint ${index}${driver} · ${from}–${to}${laps}${pit}`,
    timelineDriver: (name: string) => ` · ${name}`,
    timelineLaps: (n: number) => ` · ${n} laps`,
    timelinePit: (sec: string) => ` · stop ${sec} s`,
    timelineNote:
      "The stint plan on top (paler), the real race from the race log below. The grey strips are the pit stops with their standing time.",
    timelineMissing: (missing: number, total: number) =>
      `${missing} of ${total} stints carry no session time in the log and are therefore missing from the lower row — the table below has them all.`,
    avgPerStint: "Ø lap time per stint",
    avgPerStintAria: "Average lap time per stint",
    avgPerStintHover: (index: number, driver: string, lap: string) =>
      `Stint ${index}${driver}: ${lap}`,
    deltaPerStint: "Gap to the forecast per stint (seconds per lap)",
    deltaPerStintAria: "Gap to the forecast per stint",
    deltaNoDrivers: "The plan has no driver assigned for these stints.",
    deltaHover: (index: number, delta: string) =>
      `Stint ${index}: ${delta} s/lap against the plan`,
    deltaNote: "Up = slower than planned, down = faster.",
    colStint: "Stint",
    colDriver: "Driver",
    colLaps: "Laps",
    colFromTo: "from–to",
    colAvgLap: "Ø lap time",
    colBestLap: "best lap",
    colForecast: "Forecast",
    colDelta: "Gap",
    colIncidents: "Incidents",
    colPitStop: "Pit stop",
    incidentsNotTimed:
      "Per-stint incidents are only available when the race logger recorded them with a timestamp. This log has none — the per-driver total in the evaluation above comes from the eventresult and cannot be attributed to a stint.",
  },

  // ---- debrief: the rest of the field ------------------------------------
  dbfField: {
    boxTitle: (className: string) => `Class context — ${className}`,
    classFallback: "class",
    medianPre: "Our median was",
    medianMid: (classMedian: string) => `, the class median ${classMedian} —`,
    rank: (pos: number, of: number) => `, ${pos} of ${of} in class by pace`,
    colNum: "#",
    colTeam: "Team",
    colMedian: "Median",
    colDeltaClass: "Δ class",
    colBest: "Best",
    colSpread: "Spread",
    colStops: "Stops",
    colAvgStop: "Ø stop",
    colLaps: "Laps",
    colPos: "Pos.",
    methodStops: "Stops count from 20 seconds standing time; shorter drive-throughs stay out.",
    cautionNote:
      " The yellow band deliberately shows the pace actually driven: the field slows before race control throws the flag, and those laps are part of the race.",
    sharedNote: " The parse comes from another team's upload of the same race.",
    classMedian: "class median",
    caution: "Yellow",
    minutes: (n: number) => `${n} min`,
    classLabel: "Class",
    byPace: "by pace",
    tooFewLaps:
      "The log recorded too few clean laps for our car to form a median pace.",
    methodNote:
      "Median of the racing laps — formation and start lap, in and out laps, yellows and restarts are excluded by the same rules as for us. Spread is p90 minus median, so it is not thrown off by the one lap in the gravel. Stops count from 20 s.",
    perCarNote:
      "The numbers are per car, not per driver: for every other car the logger only records the name that was in it at the session start.",
    windowAria: "Median per ten-minute window, our car against the class",
    ourCar: "our car",
  },
  dbfPage: {
    noAccessTitle: "This debrief isn’t shared with you",
    noAccessBody:
      "It belongs to a stint plan only the creator, the drivers in it, the people they added and CLS admins can open.",
    backToPlan: "← Back to the stint plan",
    noneTitle: "No debrief yet",
    noneBodyPre: "No race log has been uploaded for",
    noneBodyMid: "yet. Upload the race logger’s",
    noneBodyMid2: "and — for a team race — the",
    noneBodyPost: "in the plan, and the debrief appears here.",
    toPlan: "→ To the stint plan",
  },
  // ---- plausibility warnings on the numbers that were entered -----------
  warn: {
    title: "Worth a second look",
    lead: "Nothing here is blocked — these are just numbers that look unusual.",
    lapTimeShort: (lap: string) =>
      `A lap time of ${lap} is very short for an endurance track. Type it as m:ss.s — “1:58.8”, not “118.8”.`,
    lapTimeLong: (lap: string) =>
      `A lap time of ${lap} is unusually long — check the format (m:ss.s).`,
    fuelVsTank: (laps: string) =>
      `At this consumption the tank lasts about ${laps} laps. Check fuel per lap and tank size against each other.`,
    stintOverRace:
      "One stint is longer than the whole race — the schedule will end up as a single stint.",
    reserveHigh:
      "The fuel reserve eats more than a fifth of the tank. That is a lot of range to give away.",
    noStops:
      "The plan comes out with no pit stop at all. For a race of this length that is usually a wrong tank size or fuel figure.",
    gridFuelHigh:
      "More fuel is booked for the lap to the grid than a normal lap burns — check the litres.",
    fuelShortStints: (n: number) =>
      `${n} stint${n === 1 ? " needs" : "s need"} more fuel than the car carries. Their laps were typed in by hand or the tank is too small.`,
    tempWithoutModel:
      "A track temperature is set but nothing measures how lap time reacts to it, so the pace is not adjusted. Pull Garage 61 laps, or enter the s/10°C by hand under Event.",
  },
  // ---- everything from Johann's layout proposal (Sept 2026) --------------
  jo: {
    // Event card
    fairShare: "Fair share",
    fairShareHint:
      "Spread the race evenly over the drivers and flag anyone who ends up well under their share. Off leaves the line-up entirely to you.",
    iRating: "iRating",
    iRatingHint:
      "This driver's iRating, for an official race. The pace curve turns it into a target lap time for them. Before the race there is no result file to read it from; uploading one afterwards overwrites what is typed here.",
    iRatingPlaceholder: "e.g. 4200",

    // Rain profile
    rainProfile: "Rain",
    rainProfileFallback: "Rain (roster default)",
    rainLead:
      "Pace AND consumption in the full wet. A wet lap is slower, so it burns less per lap — without this the plan fuelled a wet stint at the dry figure and came up short. Half wet takes half of both. Leave it empty to keep the old behaviour (lap-time penalty only).",
    rainActive: (delta: string, fuel: string) =>
      `A wet stint runs ${delta} s/lap slower on ${fuel} L/lap.`,
    rainNeedsBoth:
      "Both halves are needed — a wet lap time without a wet consumption is what the wet penalty already said.",

    // Per-driver condition columns
    colWet: "Wet +s",
    colWetHint:
      "Seconds per lap THIS driver loses in the full wet, on top of their own dry pace. Blank = the plan's figure. Rain is the widest spread there is between two drivers with the same dry pace.",
    colHalfWet: "½ wet +s",
    colHalfWetHint:
      "Seconds per lap THIS driver loses on a damp or drying track. Blank = the plan's figure.",
    colTraffic: "Traffic +s",
    colTrafficHint:
      "Seconds per lap THIS driver loses in race traffic. Blank = the plan's figure. Picking a way through backmarkers is a skill like any other.",
    colTempSlope: "s/10°C",
    colTempSlopeHint:
      "How much THIS driver's lap time moves per 10 °C of track temperature. Blank = the plan's measured slope.",
    colTarget: "Target",
    colTargetHint:
      "The lap time this driver's own iRating is worth here, read off the pace curve. Only shown for an official race with a curve chosen.",

    // Availability: double / triple stints
    colDouble: "Double",
    colDoubleHint:
      "Two stints back to back. “Happy to” is what the automatic line-up reaches for first; “ok” is fine when the plan needs it; “rather not” is the last resort before a stint stays empty.",
    colTriple: "Triple",
    colTripleHint: "Three stints back to back. Same three answers.",
    prefHappy: "happy to",
    prefOk: "ok",
    prefAvoid: "rather not",
    maxRowLegacy: "Max row (old)",
    maxRowLegacyHint:
      "The old single limit on stints in a row. Kept because plans built before the Double/Triple columns were signed off with it; leave it empty on a new plan.",

    // Fair-share check in the per-driver totals
    fairShareOk: (laps: number) => `${laps} laps — a fair share`,
    fairShareLow: (laps: number, min: number) =>
      `${laps} laps — under the ${min}-lap minimum for this plan`,
    fairShareMinNote: (min: number, even: number) =>
      `Minimum ${min} laps per driver (a quarter of the ${even}-lap even share). Anyone under it is marked.`,

    // Fuel-save targets
    targetsTitle: "What one more lap would cost",
    targetsLead:
      "What the plan runs on now, and the consumption it would take to get another lap out of the tank. Nothing here is applied to the plan — these are targets to drive to, not values to replace measured ones with.",
    colLapsPerStint: "Laps/stint",
    colNeeds: "Needs",
    colSave: "Save",
    colStops: "Stops",
    rowCurrent: "now",
    unreachable: "beyond the fuel-save profile",
    targetsSaves: (n: number) =>
      n === 0 ? "same stops" : `${n} stop${n === 1 ? "" : "s"} fewer`,
    targetsNone:
      "Enter the tank size and a consumption to see what a longer stint would take.",
    analysisDetails: "Full stop-count sweep",

    // Easy mode
    easyPitNote: "Detailed pit values and the Garage 61 import are in Advanced.",
  },
  // ---- the five tabs ----------------------------------------------------
  tabs: {
    basis: "Basics",
    basisHint: "event, pit stop, roster",
    prep: "Preparation",
    prepHint: "pace, fuel, driver figures",
    during: "Schedule & Live",
    duringHint: "the plan, and where the race is right now",
    post: "After race",
    postHint: "result & analysis",
  },
  // <<SECTIONS>>
};
