/**
 * Live pit-stop tire data from the drivers' Race Loggers, for the stream.
 *
 * iRacing publishes tread depth for the LOCAL car only, so the broadcast PC
 * cannot see anybody's tires. Each driver's RaceLogger.exe sends its own stop
 * here the moment the car leaves the pit lane (POST /api/race-log/live) and the
 * stream overlay reads them back (GET /api/overlay/pit-tires).
 *
 * Deliberately IN MEMORY, not in Postgres: the data is only interesting for the
 * few hours of a race, the full record arrives anyway with the uploaded log,
 * and no schema change is needed. A redeploy clears the store, which costs at
 * most the stops of a race that is running at that moment. The app runs as ONE
 * Next.js standalone process on the Hetzner box, so one Map is the whole store.
 */

export const LIVE_PIT_KEEP_MS = 6 * 60 * 60 * 1000;   // 6 h — longer than any CAS race
export const LIVE_PIT_MAX_STOPS = 3000;
/** Per driver and hour. A real race has a handful of stops; this only stops a
 *  broken client from filling the store. */
export const LIVE_PIT_MAX_PER_HOUR = 60;

const CORNERS = ["lf", "rf", "lr", "rr"] as const;
type Corner = (typeof CORNERS)[number];

export type LiveTire = {
  /** Tread % [inner, middle, outer] when the car arrived — what came off. */
  wearIn: number[] | null;
  /** Tread % [inner, middle, outer] when the car left. */
  wearOut: number[];
  /** wearOut is an unused set (every strip >= 98 %). */
  fresh: boolean;
  /** A different set went on; null = iRacing gave only one reading. */
  changed: boolean | null;
};

export type LivePitStop = {
  id: number;
  receivedAt: string;
  // --- which race (the hosted session all drivers share) ---
  subsessionId: number | null;
  sessionId: number | null;
  sessionNum: number | null;
  sessionName: string | null;
  track: string | null;
  // --- who ---
  userId: string;
  driver: string;
  iracingMemberId: string | null;
  custId: number | null;
  carNumber: string;
  // --- the stop ---
  tSession: number | null;
  entryLap: number | null;
  duration: number | null;
  stopCount: number | null;
  tires: Partial<Record<Corner, LiveTire>>;
  tiresChanged: Corner[];
  leftOnFresh: boolean | null;
  serviceRequested: string[];
  fuelL: number | null;
};

type Store = { nextId: number; stops: LivePitStop[] };

// Survives Next's module re-evaluation in dev; in production it is simply
// module state of the one server process.
const g = globalThis as unknown as { __livePitStore?: Store };
function store(): Store {
  if (!g.__livePitStore) g.__livePitStore = { nextId: 1, stops: [] };
  return g.__livePitStore;
}

// ---------------------------------------------------------------------------
// Validation — the body comes from a program on a driver's PC, so every field
// is checked and anything unexpected is dropped rather than stored.
// ---------------------------------------------------------------------------

function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function int(v: unknown, min: number, max: number): number | null {
  const n = num(v, min, max);
  return n === null ? null : Math.trunc(n);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).trim().slice(0, max);
  return s || null;
}

function triple(v: unknown): number[] | null {
  if (!Array.isArray(v) || v.length !== 3) return null;
  const out = v.map((x) => num(x, 0, 100));
  return out.every((x) => x !== null) ? (out as number[]).map((x) => Math.round(x * 10) / 10) : null;
}

function tri(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

export type ParsedLivePit = Omit<
  LivePitStop,
  "id" | "receivedAt" | "userId" | "driver" | "iracingMemberId"
>;

/** Parse the logger's JSON body. Returns null when it holds no tire data. */
export function parseLivePit(body: unknown): { ok: true; stop: ParsedLivePit } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "JSON object expected" };
  const b = body as Record<string, unknown>;
  const session = (b.session && typeof b.session === "object" ? b.session : {}) as Record<string, unknown>;
  const ev = (b.event && typeof b.event === "object" ? b.event : null) as Record<string, unknown> | null;
  if (!ev || ev.type !== "pit") return { ok: false, error: "event.type must be 'pit'" };

  const tires: Partial<Record<Corner, LiveTire>> = {};
  const rawTires = (ev.tires && typeof ev.tires === "object" ? ev.tires : {}) as Record<string, unknown>;
  for (const c of CORNERS) {
    const t = rawTires[c] as Record<string, unknown> | undefined;
    if (!t || typeof t !== "object") continue;
    const wearOut = triple(t.wear_out);
    if (!wearOut) continue;
    tires[c] = {
      wearIn: triple(t.wear_in),
      wearOut,
      fresh: tri(t.fresh) ?? Math.min(...wearOut) >= 98,
      changed: tri(t.changed),
    };
  }
  if (Object.keys(tires).length === 0) return { ok: false, error: "No tire readings in the event" };

  const changedRaw = Array.isArray(ev.tires_changed) ? ev.tires_changed : [];
  const tiresChanged = CORNERS.filter((c) => changedRaw.includes(c));
  const service = (ev.service && typeof ev.service === "object" ? ev.service : {}) as Record<string, unknown>;
  const requested = Array.isArray(service.requested)
    ? service.requested.map((x) => str(x, 32)).filter((x): x is string => !!x).slice(0, 10)
    : [];

  return {
    ok: true,
    stop: {
      subsessionId: int(session.subsession_id, 1, 1e12),
      sessionId: int(session.session_id, 1, 1e12),
      sessionNum: int(session.session_num, 0, 100),
      sessionName: str(session.session_name, 40),
      track: str(session.track, 80),
      custId: int((b.driver as Record<string, unknown> | undefined)?.cust_id, 1, 1e10),
      carNumber: str(ev.car_number, 8) ?? "",
      tSession: num(ev.t_session, 0, 1e6),
      entryLap: int(ev.entry_lap, 0, 10000),
      duration: num(ev.duration, 0, 7200),
      stopCount: int(ev.stop_count, 0, 1000),
      tires,
      tiresChanged,
      leftOnFresh: tri(ev.left_on_fresh),
      serviceRequested: requested,
      fuelL: num(service.fuel_l, 0, 1000),
    },
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

function prune(s: Store, nowMs: number) {
  const cutoff = nowMs - LIVE_PIT_KEEP_MS;
  s.stops = s.stops.filter((x) => Date.parse(x.receivedAt) >= cutoff);
  if (s.stops.length > LIVE_PIT_MAX_STOPS) s.stops = s.stops.slice(-LIVE_PIT_MAX_STOPS);
}

/** Store one stop. The same stop sent twice (a retry) replaces the first copy
 *  but keeps a NEW id, so a reader polling with `after` picks up the fix. */
export function addLivePit(
  who: { userId: string; driver: string; iracingMemberId: string | null },
  stop: ParsedLivePit,
  nowMs: number = Date.now()
): { ok: true; row: LivePitStop } | { ok: false; error: string } {
  const s = store();
  prune(s, nowMs);
  const hourAgo = nowMs - 60 * 60 * 1000;
  const recent = s.stops.filter((x) => x.userId === who.userId && Date.parse(x.receivedAt) >= hourAgo);
  if (recent.length >= LIVE_PIT_MAX_PER_HOUR) return { ok: false, error: "Too many stops in the last hour" };

  const same = (x: LivePitStop) =>
    x.userId === who.userId &&
    x.subsessionId === stop.subsessionId &&
    x.sessionNum === stop.sessionNum &&
    x.stopCount !== null &&
    x.stopCount === stop.stopCount;
  s.stops = s.stops.filter((x) => !same(x));

  const row: LivePitStop = {
    ...stop,
    id: s.nextId++,
    receivedAt: new Date(nowMs).toISOString(),
    userId: who.userId,
    driver: who.driver,
    iracingMemberId: who.iracingMemberId,
  };
  s.stops.push(row);
  return { ok: true, row };
}

/** Stops for the overlay, oldest first. `subsessionId` narrows to one hosted
 *  session; `afterId` returns only what arrived since the last poll. */
export function listLivePits(
  opts: { subsessionId?: number | null; afterId?: number; maxAgeMs?: number },
  nowMs: number = Date.now()
): LivePitStop[] {
  const s = store();
  prune(s, nowMs);
  const cutoff = nowMs - (opts.maxAgeMs ?? LIVE_PIT_KEEP_MS);
  return s.stops.filter(
    (x) =>
      Date.parse(x.receivedAt) >= cutoff &&
      (opts.subsessionId == null || x.subsessionId === opts.subsessionId) &&
      (opts.afterId == null || x.id > opts.afterId)
  );
}

/** Tests only. */
export function _resetLivePits() {
  g.__livePitStore = { nextId: 1, stops: [] };
}
