/**
 * CAS Rating (CR) — one number 0-100 per driver across all CAS leagues.
 * Regulation agreed 2026-11-12, see /admin/cas-rating:
 *
 *   CR = 70 % performance + 30 % attendance, always over the last 10 races.
 *
 *   Race points (max 100): place 60 (winner 60, last 0, linear; DNF/DSQ 0)
 *   + clean 40 (minus 4 per incident per 10 laps, floor 0)
 *   - steward penalty category 1/2/3 = 5/10/20 in that race.
 *   No-show without declining = -5.  DNS = no race.
 *
 *   Performance = average race points of the last 10 races; missing races
 *   up to 10 count as 50.
 *   Attendance  = per league the driver is currently registered in: driven of
 *   the last 10 races held since registration, summed over the leagues;
 *   missing races up to 10 count as half driven. Nobody registered = 50 %.
 *   Bonus (+1 driven / +1 race): a Fun League race driven, a race streamed or
 *   driven in a league the driver is not registered in.
 *
 * Pure module: no DB, no React. Data comes from src/lib/cas-rating-data.ts.
 */

export const CR_WINDOW = 10;
export const CR_START = 50;
export const CR_PLACE_MAX = 60;
export const CR_CLEAN_MAX = 40;
/** Clean points lost per incident per 10 laps. */
export const CR_CLEAN_PER_INCIDENT = 4;
export const CR_PENALTY_BY_LEVEL: Record<number, number> = { 1: 5, 2: 10, 3: 20 };
export const CR_NO_SHOW = 5;
export const CR_W_PERFORMANCE = 0.7;
export const CR_W_ATTENDANCE = 0.3;

/** One race held in a counting league. A two-race round is two races. */
export type CrRace = {
  key: string; // `${roundId}:${raceNumber}`
  roundId: string;
  raceNumber: number;
  roundNumber: number;
  raceCount: number; // races in this round (1 or 2)
  leagueSlug: string;
  leagueName: string;
  seasonId: string;
  at: Date;
  /** Fun League: no duty to race — attendance only as a bonus, no no-show. */
  open: boolean;
};

/** A driver's result in one race (DNS results are never passed in). */
export type CrResult = {
  raceKey: string;
  userId: string;
  position: number; // rank in the field the place points come from
  fieldSize: number;
  status: "CLASSIFIED" | "DNF" | "DSQ";
  incidents: number;
  laps: number;
  /** Penalty points of this race (positive number, deducted). */
  penalty: number;
};

/** Points taken off outside a race entry: a no-show, or a penalty in a race
 *  the driver has no result for. */
export type CrAdjustment = {
  userId: string;
  raceKey: string;
  at: Date;
  points: number; // positive, deducted
  reason: "no-show" | "penalty";
};

/** A season registration that makes the driver "registered" in a league. */
export type CrRegistration = {
  userId: string;
  leagueSlug: string;
  seasonId: string;
  from: Date;
  /** Withdrawn / retired / excluded: races after this do not count. */
  until: Date | null;
  /** Season completed: the league drops out after its last race. */
  seasonEndsAt: Date | null;
};

export type CrStream = { userId: string; raceKey: string };

export type CrInput = {
  races: CrRace[];
  results: CrResult[];
  adjustments: CrAdjustment[];
  registrations: CrRegistration[];
  streams: CrStream[];
};

export type CrRaceEntry = {
  race: CrRace;
  position: number;
  fieldSize: number;
  status: CrResult["status"];
  incidents: number;
  laps: number;
  place: number;
  clean: number;
  penalty: number;
  total: number;
};

export type CrLeagueAttendance = {
  leagueSlug: string;
  leagueName: string;
  held: number; // races held since registration, max 10
  driven: number;
  streamed: number;
};

export type CrRating = {
  userId: string;
  rating: number;
  performance: number;
  attendance: number; // 0-100
  /** Real races in the performance window (the rest are 50s). */
  windowRaces: CrRaceEntry[];
  adjustments: CrAdjustment[];
  leagues: CrLeagueAttendance[];
  bonus: number;
  /** All counted races ever (for the licence card). */
  raceCount: number;
  leagueSlugs: string[];
};

export function placePoints(position: number, fieldSize: number, status: CrResult["status"]): number {
  if (status !== "CLASSIFIED") return 0;
  if (fieldSize <= 1) return CR_PLACE_MAX;
  const p = Math.min(Math.max(position, 1), fieldSize);
  return (CR_PLACE_MAX * (fieldSize - p)) / (fieldSize - 1);
}

export function cleanPoints(incidents: number, laps: number): number {
  const per10 = (incidents * 10) / Math.max(laps, 1);
  return Math.max(0, CR_CLEAN_MAX - CR_CLEAN_PER_INCIDENT * per10);
}

export function penaltyForLevel(level: number | null | undefined): number {
  return level == null ? 0 : CR_PENALTY_BY_LEVEL[level] ?? 0;
}

export const round1 = (v: number) => Math.round(v * 10) / 10;

const byAtDesc = <T extends { at: Date }>(a: T, b: T) => b.at.getTime() - a.at.getTime();

/** Indexes the input once; `rate()` then answers per driver and date. */
export function buildCasRating(input: CrInput) {
  const raceByKey = new Map(input.races.map((r) => [r.key, r]));
  const races = [...input.races].sort(byAtDesc);

  const group = <T extends { userId: string }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const list = m.get(r.userId);
      if (list) list.push(r);
      else m.set(r.userId, [r]);
    }
    return m;
  };
  const resultsByUser = group(input.results);
  const adjByUser = group(input.adjustments);
  const regsByUser = group(input.registrations);
  const streamsByUser = group(input.streams);

  function entriesOf(userId: string, asOf: Date): CrRaceEntry[] {
    const out: CrRaceEntry[] = [];
    for (const r of resultsByUser.get(userId) ?? []) {
      const race = raceByKey.get(r.raceKey);
      if (!race || race.at > asOf) continue;
      const place = placePoints(r.position, r.fieldSize, r.status);
      const clean = cleanPoints(r.incidents, r.laps);
      out.push({
        race,
        position: r.position,
        fieldSize: r.fieldSize,
        status: r.status,
        incidents: r.incidents,
        laps: r.laps,
        place,
        clean,
        penalty: r.penalty,
        total: place + clean - r.penalty,
      });
    }
    return out.sort((a, b) => b.race.at.getTime() - a.race.at.getTime() || b.race.raceNumber - a.race.raceNumber);
  }

  function rate(userId: string, asOf: Date = new Date()): CrRating {
    const entries = entriesOf(userId, asOf);
    const window = entries.slice(0, CR_WINDOW);

    // A deduction outside a race counts while it is newer than the oldest race
    // in the window (always, while the window is not full yet).
    const oldest = window.length >= CR_WINDOW ? window[window.length - 1].race.at : null;
    const adjustments = (adjByUser.get(userId) ?? [])
      .filter((a) => a.at <= asOf && (!oldest || a.at >= oldest))
      .sort(byAtDesc);
    const perfSum =
      window.reduce((s, e) => s + e.total, 0) +
      CR_START * (CR_WINDOW - window.length) -
      adjustments.reduce((s, a) => s + a.points, 0);
    const performance = perfSum / CR_WINDOW;

    // ---- attendance --------------------------------------------------------
    const driven = new Set(entries.map((e) => e.race.key));
    const streamed = new Set(
      (streamsByUser.get(userId) ?? [])
        .filter((s) => (raceByKey.get(s.raceKey)?.at ?? asOf) <= asOf)
        .map((s) => s.raceKey)
    );

    const regs = (regsByUser.get(userId) ?? []).filter((r) => r.from <= asOf);
    // A league counts while one of its registrations is current: the season
    // has not ended, and (withdrawn) there was at least one race before.
    const currentLeagues = new Set<string>();
    for (const r of regs) {
      if (r.seasonEndsAt && r.seasonEndsAt < asOf) continue;
      if (r.until) {
        const until = r.until;
        const anyBefore = races.some(
          (x) => x.seasonId === r.seasonId && x.at >= r.from && x.at <= until && x.at <= asOf
        );
        if (!anyBefore) continue;
      }
      currentLeagues.add(r.leagueSlug);
    }

    const covered = new Set<string>(); // race keys inside an attendance window
    const leagues: CrLeagueAttendance[] = [];
    let num = 0;
    let den = 0;
    for (const slug of currentLeagues) {
      const own = regs.filter((r) => r.leagueSlug === slug);
      const held = races
        .filter(
          (x) =>
            x.leagueSlug === slug &&
            x.at <= asOf &&
            own.some((r) => r.seasonId === x.seasonId && x.at >= r.from && (!r.until || x.at <= r.until))
        )
        .slice(0, CR_WINDOW);
      let d = 0;
      let st = 0;
      for (const x of held) {
        covered.add(x.key);
        if (driven.has(x.key)) d++;
        else if (streamed.has(x.key)) {
          d++;
          st++;
        }
      }
      num += d + 0.5 * (CR_WINDOW - held.length);
      den += CR_WINDOW;
      leagues.push({
        leagueSlug: slug,
        leagueName: held[0]?.leagueName ?? races.find((x) => x.leagueSlug === slug)?.leagueName ?? slug,
        held: held.length,
        driven: d,
        streamed: st,
      });
    }
    if (den === 0) {
      // Registered nowhere: 50 %.
      num = 0.5 * CR_WINDOW;
      den = CR_WINDOW;
    }

    // Bonus: a driven or streamed race in a season the driver was not
    // registered for (fill-in from the waiting list, streaming someone else's
    // league) and every Fun League race driven. Newest 10.
    const registeredSeasons = new Set(regs.map((r) => r.seasonId));
    const bonusRaces = [...new Set([...driven, ...streamed])]
      .map((key) => raceByKey.get(key)!)
      .filter((x) => x && !covered.has(x.key) && (x.open || !registeredSeasons.has(x.seasonId)));
    const bonus = Math.min(CR_WINDOW, bonusRaces.length);
    num += bonus;
    den += bonus;

    const attendance = (100 * num) / den;
    const rating = Math.min(100, Math.max(0, CR_W_PERFORMANCE * performance + CR_W_ATTENDANCE * attendance));

    return {
      userId,
      rating,
      performance,
      attendance,
      windowRaces: window,
      adjustments,
      leagues: leagues.sort((a, b) => a.leagueName.localeCompare(b.leagueName)),
      bonus,
      raceCount: entries.length,
      leagueSlugs: [...new Set(entries.map((e) => e.race.leagueSlug))],
    };
  }

  /** CR after each counting race date, oldest first (the curve). */
  function history(userId: string, asOf: Date = new Date()): { at: Date; rating: number }[] {
    const dates = [...new Set(races.filter((r) => r.at <= asOf).map((r) => r.at.getTime()))].sort((a, b) => a - b);
    return dates.map((t) => ({ at: new Date(t), rating: rate(userId, new Date(t)).rating }));
  }

  /** Change since the driver's last race: CR now minus CR just before it. */
  function deltaSinceLastRace(userId: string, asOf: Date = new Date()): number | null {
    const last = entriesOf(userId, asOf)[0];
    if (!last) return null;
    const before = new Date(last.race.at.getTime() - 1);
    return rate(userId, asOf).rating - rate(userId, before).rating;
  }

  const userIds = new Set<string>([
    ...resultsByUser.keys(),
    ...regsByUser.keys(),
    ...adjByUser.keys(),
    ...streamsByUser.keys(),
  ]);

  return { rate, history, deltaSinceLastRace, userIds, races };
}
