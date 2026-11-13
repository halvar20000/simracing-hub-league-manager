/**
 * Stream calendar: who streams which league race (admin page
 * /admin/stream-calendar). Thomas and Andreas share the broadcasts.
 *
 * Storage: `AppSetting`, one row per race, so a change is a single atomic
 * upsert and no schema change is needed:
 *   stream-calendar:round:<roundId>        a real CLS round
 *   stream-calendar:slot:<slug>:<date>     a race planned but not in CLS yet
 *
 * A race's streamer = its round row -> its slot row -> STREAM_PLAN -> Open.
 * So the agreed plan keeps working when a planned season is created later, as
 * long as the date matches; a moved race simply shows up as Open.
 *
 * Dates are the naive wall clock CLS uses everywhere (same getHours()/getDate()
 * reading as formatDateTime), not true instants.
 *
 * Pure module: no DB, no React.
 */
import { iracingSeasonAt } from "./iracing-season";

export const STREAMERS = ["Thomas", "Andreas"] as const;
export const STREAM_OPEN = "Open";
export const STREAM_VALUES: readonly string[] = [...STREAMERS, STREAM_OPEN];

/** The leagues being streamed, in table order. */
export const STREAM_LEAGUES = [
  { slug: "cas-gt3-wct", name: "GT3 WCT" },
  { slug: "cas-combined-cup", name: "Combined Cup" },
  { slug: "cas-sfl-cup", name: "SFL Cup" },
  { slug: "cas-pccd", name: "Porsche Cup" },
  { slug: "cas-iec", name: "IEC" },
] as const;

/** The calendar starts here; earlier races were not part of the plan. */
export const STREAM_CALENDAR_START = "2026-11-09";

/**
 * The plan agreed on 2026-11-04: [league, date, time, streamer, planned].
 * planned = the race was not in CLS yet, so its date is an assumption from the
 * league's rhythm. It is listed until the league has a real round on or after
 * that date, which means the new season has taken over.
 */
const STREAM_PLAN: ReadonlyArray<
  readonly [string, string, string, string, boolean]
> = [
  ["cas-combined-cup", "2026-11-18", "19:00", "Thomas", false],
  ["cas-combined-cup", "2026-12-02", "19:00", "Andreas", false],
  ["cas-combined-cup", "2026-12-16", "19:00", "Andreas", false],
  ["cas-combined-cup", "2026-12-30", "19:00", "Thomas", false],
  ["cas-combined-cup", "2027-01-13", "19:00", "Thomas", false],
  ["cas-combined-cup", "2027-01-27", "19:00", "Thomas", false],
  ["cas-combined-cup", "2027-02-11", "19:00", "Thomas", true],
  ["cas-combined-cup", "2027-02-25", "19:00", "Thomas", true],
  ["cas-combined-cup", "2027-03-11", "19:00", "Andreas", true],
  ["cas-gt3-wct", "2026-11-10", "18:00", "Thomas", false],
  ["cas-gt3-wct", "2026-11-17", "18:00", "Andreas", false],
  ["cas-gt3-wct", "2026-11-24", "18:00", "Thomas", false],
  ["cas-gt3-wct", "2026-12-01", "18:00", "Andreas", false],
  ["cas-gt3-wct", "2026-12-07", "18:00", "Thomas", false],
  ["cas-gt3-wct", "2026-12-15", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2026-12-22", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2026-12-29", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2027-01-05", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2027-01-12", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2027-01-19", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2027-01-26", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2027-02-02", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2027-02-09", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2027-02-16", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2027-02-23", "18:00", "Andreas", true],
  ["cas-gt3-wct", "2027-03-02", "18:00", "Thomas", true],
  ["cas-gt3-wct", "2027-03-16", "18:00", "Andreas", true],
  ["cas-iec", "2026-11-28", "16:00", "Thomas", false],
  ["cas-iec", "2027-01-23", "16:00", "Andreas", false],
  ["cas-iec", "2027-03-06", "16:00", "Andreas", false],
  ["cas-pccd", "2026-12-03", "19:00", "Thomas", false],
  ["cas-pccd", "2026-12-17", "19:00", "Thomas", false],
  ["cas-pccd", "2027-01-07", "19:00", "Thomas", false],
  ["cas-pccd", "2027-01-21", "19:00", "Thomas", false],
  ["cas-pccd", "2027-02-04", "19:00", "Thomas", false],
  ["cas-pccd", "2027-02-18", "19:00", "Thomas", false],
  ["cas-pccd", "2027-03-04", "19:00", "Thomas", false],
  ["cas-pccd", "2027-03-18", "19:00", "Thomas", false],
  ["cas-sfl-cup", "2026-11-25", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2026-12-09", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2026-12-23", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-01-06", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-01-20", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-02-03", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-02-17", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-03-03", "19:00", "Andreas", false],
  ["cas-sfl-cup", "2027-03-17", "19:00", "Andreas", true],
];

const KEY_PREFIX = "stream-calendar:";
export const STREAM_KEY_PREFIX = KEY_PREFIX;

export function roundStreamKey(roundId: string): string {
  return `${KEY_PREFIX}round:${roundId}`;
}

function slotStreamKey(slug: string, date: string): string {
  return `${KEY_PREFIX}slot:${slug}:${date}`;
}

/** The server action only ever writes keys of these two shapes. */
export function isStreamKey(key: string): boolean {
  return /^stream-calendar:(round:[\w-]+|slot:[a-z0-9-]+:\d{4}-\d{2}-\d{2})$/.test(
    key
  );
}

export type StreamRoundInput = {
  id: string;
  seasonId: string;
  leagueSlug: string;
  roundNumber: number;
  name: string;
  track: string;
  startsAt: Date;
};

export type StreamRace = {
  key: string;
  leagueSlug: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  title: string;
  streamer: string;
  planned: boolean;
  href: string | null;
};

export type StreamWeek = {
  monday: string; // YYYY-MM-DD
  isoWeek: number;
  iracingWeek13: boolean;
  isPast: boolean;
  races: StreamRace[];
  counts: Record<string, number>;
};

export type StreamerSummary = {
  name: string;
  perLeague: Record<string, number>;
  total: number;
  confirmed: number;
  perWeek: number;
  maxInWeek: number;
  weeksWithTwoPlus: number;
  weeksWithNone: number;
};

export type StreamCalendar = {
  weeks: StreamWeek[];
  summary: StreamerSummary[];
  openCount: number;
  raceCount: number;
};

const pad = (n: number) => String(n).padStart(2, "0");

function localDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
const utcDate = (d: Date) => d.toISOString().slice(0, 10);

function mondayOf(date: string): string {
  const d = asUtc(date);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return utcDate(d);
}

function isoWeekOf(monday: string): number {
  const thursday = asUtc(monday);
  thursday.setUTCDate(thursday.getUTCDate() + 3);
  const jan1 = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1) / 86_400_000 / 7) + 1;
}

/**
 * Who streams this one round ("Thomas", "Andreas", "Open"), with the same
 * lookup as the calendar: round row -> slot row -> STREAM_PLAN -> Open.
 * Null when the round is before the calendar starts.
 */
export function streamerOfRound(
  round: StreamRoundInput,
  overrides: Map<string, string>
): string | null {
  const cal = buildStreamCalendar([round], overrides);
  const key = roundStreamKey(round.id);
  for (const w of cal.weeks) for (const r of w.races) if (r.key === key) return r.streamer;
  return null;
}

/** The two AppSetting keys that can hold this round's streamer. */
export function streamKeysOfRound(round: { id: string; leagueSlug: string; startsAt: Date }): string[] {
  return [roundStreamKey(round.id), slotStreamKey(round.leagueSlug, localDate(round.startsAt))];
}

export function buildStreamCalendar(
  rounds: StreamRoundInput[],
  overrides: Map<string, string>,
  now: Date = new Date()
): StreamCalendar {
  const planned = new Map(
    STREAM_PLAN.map((p) => [`${p[0]}|${p[1]}`, p] as const)
  );
  const lastRealDate = new Map<string, string>();
  const races: StreamRace[] = [];

  for (const r of rounds) {
    const date = localDate(r.startsAt);
    if (date < STREAM_CALENDAR_START) continue;
    if ((lastRealDate.get(r.leagueSlug) ?? "") < date) {
      lastRealDate.set(r.leagueSlug, date);
    }
    races.push({
      key: roundStreamKey(r.id),
      leagueSlug: r.leagueSlug,
      date,
      time: `${pad(r.startsAt.getHours())}:${pad(r.startsAt.getMinutes())}`,
      title: r.track || r.name,
      streamer:
        overrides.get(roundStreamKey(r.id)) ??
        overrides.get(slotStreamKey(r.leagueSlug, date)) ??
        planned.get(`${r.leagueSlug}|${date}`)?.[3] ??
        STREAM_OPEN,
      planned: false,
      href: `/admin/leagues/${r.leagueSlug}/seasons/${r.seasonId}/rounds/${r.id}`,
    });
  }

  for (const [slug, date, time, streamer, isPlanned] of STREAM_PLAN) {
    if (!isPlanned || (lastRealDate.get(slug) ?? "") >= date) continue;
    const key = slotStreamKey(slug, date);
    races.push({
      key,
      leagueSlug: slug,
      date,
      time,
      title: "Next season (date assumed)",
      streamer: overrides.get(key) ?? streamer,
      planned: true,
      href: null,
    });
  }

  races.sort((a, b) =>
    `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
  );

  // Every Monday between the first and last race, so a free week stays visible.
  const weeks: StreamWeek[] = [];
  if (races.length > 0) {
    const today = localDate(now);
    const last = mondayOf(races[races.length - 1].date);
    const cursor = asUtc(mondayOf(races[0].date));
    while (utcDate(cursor) <= last) {
      const monday = utcDate(cursor);
      const nextMonday = new Date(cursor);
      nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
      // iRacing's week turns over on Tuesday 00:00 GMT.
      const tuesday = new Date(cursor);
      tuesday.setUTCDate(tuesday.getUTCDate() + 1);
      const weekRaces = races.filter((r) => mondayOf(r.date) === monday);
      const counts: Record<string, number> = {};
      for (const s of STREAM_VALUES) {
        counts[s] = weekRaces.filter((r) => r.streamer === s).length;
      }
      weeks.push({
        monday,
        isoWeek: isoWeekOf(monday),
        iracingWeek13: iracingSeasonAt(tuesday).week === 13,
        isPast: utcDate(nextMonday) <= today,
        races: weekRaces,
        counts,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
  }

  const summary = STREAMERS.map((name): StreamerSummary => {
    const own = races.filter((r) => r.streamer === name);
    const perLeague: Record<string, number> = {};
    for (const l of STREAM_LEAGUES) {
      perLeague[l.slug] = own.filter((r) => r.leagueSlug === l.slug).length;
    }
    const perWeekCounts = weeks.map((w) => w.counts[name]);
    return {
      name,
      perLeague,
      total: own.length,
      confirmed: own.filter((r) => !r.planned).length,
      perWeek: weeks.length ? own.length / weeks.length : 0,
      maxInWeek: Math.max(0, ...perWeekCounts),
      weeksWithTwoPlus: perWeekCounts.filter((n) => n >= 2).length,
      weeksWithNone: perWeekCounts.filter((n) => n === 0).length,
    };
  });

  return {
    weeks,
    summary,
    openCount: races.filter((r) => r.streamer === STREAM_OPEN).length,
    raceCount: races.length,
  };
}
