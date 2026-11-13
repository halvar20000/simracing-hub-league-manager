/**
 * Loads the CAS Rating input (src/lib/cas-rating.ts) from the database.
 * Not "use server": imported by pages, actions and the test script alike.
 *
 * Which races count is set per league in AppSetting `cas-rating:config`
 * (admin page /admin/cas-rating): a league counts from one season on — that
 * season and every later one; races of seasons already running when the
 * league joined never count. Optional `fromDate` for the open-ended Fun
 * League season. A league without an entry does not count at all.
 *
 * Only PUBLISHED races count (Round.status COMPLETED), like the standings.
 */
import type { PrismaClient } from "@prisma/client";
import {
  buildCasRating,
  penaltyForLevel,
  CR_NO_SHOW,
  type CrAdjustment,
  type CrInput,
  type CrRace,
  type CrRegistration,
  type CrResult,
  type CrStream,
} from "./cas-rating";
import { buildStreamCalendar, STREAM_KEY_PREFIX, STREAMERS } from "./stream-calendar";

export const CR_CONFIG_KEY = "cas-rating:config";
export const crWithdrawnKey = (registrationId: string) => `cas-rating:withdrawn:${registrationId}`;

/** Leagues with no duty to race every round. */
export const CR_OPEN_LEAGUE_SLUGS = new Set(["cas-fun-league"]);

export type CrLeagueConfig = { fromSeasonId: string; fromDate?: string | null };
export type CrConfig = {
  leagues: Record<string, CrLeagueConfig>; // by league slug
  /** Stream-calendar name ("Thomas", "Andreas") -> CLS user id. */
  streamers: Record<string, string>;
};

export function parseCrConfig(value: string | null | undefined): CrConfig {
  const empty: CrConfig = { leagues: {}, streamers: {} };
  if (!value) return empty;
  try {
    const v = JSON.parse(value);
    return {
      leagues: v && typeof v.leagues === "object" && v.leagues ? v.leagues : {},
      streamers: v && typeof v.streamers === "object" && v.streamers ? v.streamers : {},
    };
  } catch {
    return empty;
  }
}

export async function loadCrConfig(prisma: PrismaClient): Promise<CrConfig> {
  const row = await prisma.appSetting.findUnique({ where: { key: CR_CONFIG_KEY } });
  return parseCrConfig(row?.value);
}

type Status = "CLASSIFIED" | "DNF" | "DNS" | "DSQ";

/** Rank inside the field the place points come from: lowest position first. */
function rankField<T extends { pos: number; status: Status }>(rows: T[]): Map<T, number> {
  const field = rows.filter((r) => r.status !== "DNS").sort((a, b) => a.pos - b.pos);
  return new Map(field.map((r, i) => [r, i + 1]));
}

const raceKeyOf = (roundId: string, raceNumber: number) => `${roundId}:${raceNumber}`;

export async function loadCasRatingInput(
  prisma: PrismaClient,
  config?: CrConfig
): Promise<{ input: CrInput; config: CrConfig; names: Map<string, string> }> {
  const cfg = config ?? (await loadCrConfig(prisma));
  const slugs = Object.keys(cfg.leagues);
  const names = new Map<string, string>();
  const empty: CrInput = { races: [], results: [], adjustments: [], registrations: [], streams: [] };
  if (slugs.length === 0) return { input: empty, config: cfg, names };

  const seasons = await prisma.season.findMany({
    where: { league: { slug: { in: slugs } } },
    select: {
      id: true,
      status: true,
      isMulticlass: true,
      teamRegistration: true,
      league: { select: { slug: true, name: true } },
      rounds: { select: { id: true, startsAt: true, status: true, roundNumber: true }, orderBy: { startsAt: "asc" } },
    },
  });

  // ---- which seasons / rounds count ----------------------------------------
  const counting = seasons.filter((s) => {
    const c = cfg.leagues[s.league.slug];
    if (!c) return false;
    if (s.id === c.fromSeasonId) return true;
    const from = seasons.find((x) => x.id === c.fromSeasonId);
    const cutoff = from?.rounds[0]?.startsAt ?? (c.fromDate ? new Date(c.fromDate) : null);
    const first = s.rounds[0]?.startsAt;
    return !!cutoff && !!first && first >= cutoff;
  });
  const seasonById = new Map(counting.map((s) => [s.id, s]));
  const countingRounds = counting.flatMap((s) => {
    const fromDate = cfg.leagues[s.league.slug]?.fromDate;
    const min = fromDate ? new Date(fromDate) : null;
    return s.rounds
      .filter((r) => r.status === "COMPLETED" && (!min || r.startsAt >= min))
      .map((r) => ({ ...r, season: s }));
  });
  const roundIds = countingRounds.map((r) => r.id);
  const seasonIds = counting.map((s) => s.id);

  const [raceResults, teamResults, penalties, declined, registrations, streamRows] = await Promise.all([
    prisma.raceResult.findMany({
      where: { roundId: { in: roundIds } },
      select: {
        roundId: true,
        raceNumber: true,
        finishPosition: true,
        classPosition: true,
        finishStatus: true,
        incidents: true,
        lapsCompleted: true,
        registration: { select: { userId: true, carClassId: true } },
      },
    }),
    prisma.teamResult.findMany({
      where: { roundId: { in: roundIds } },
      select: {
        roundId: true,
        raceNumber: true,
        finishPosition: true,
        classPosition: true,
        finishStatus: true,
        carClassId: true,
        participations: {
          select: {
            lapsCompleted: true,
            incidents: true,
            registration: { select: { userId: true } },
          },
        },
      },
    }),
    prisma.penalty.findMany({
      where: {
        roundId: { in: roundIds },
        type: "POINTS_DEDUCTION",
        source: { not: "NO_RSVP_NO_SHOW" },
        categoryLevel: { in: [1, 2, 3] },
        teamOnly: false,
      },
      select: {
        roundId: true,
        categoryLevel: true,
        registration: { select: { userId: true } },
        sourceIncidentDecision: { select: { incidentReport: { select: { session: true } } } },
      },
    }),
    prisma.roundRsvp.findMany({
      where: { roundId: { in: roundIds }, status: "DECLINED" },
      select: { roundId: true, registration: { select: { userId: true } } },
    }),
    prisma.registration.findMany({
      where: { seasonId: { in: seasonIds }, isTeamManager: false, status: { in: ["APPROVED", "WITHDRAWN"] } },
      select: {
        id: true,
        seasonId: true,
        userId: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        waitlistedAt: true,
        approvedAt: true,
        retiredAt: true,
        excludedAt: true,
        user: { select: { name: true, firstName: true, lastName: true } },
      },
    }),
    prisma.appSetting.findMany({ where: { key: { startsWith: STREAM_KEY_PREFIX } } }),
  ]);

  const withdrawnRows = await prisma.appSetting.findMany({
    where: { key: { in: registrations.filter((r) => r.status === "WITHDRAWN").map((r) => crWithdrawnKey(r.id)) } },
  });
  const withdrawnAt = new Map(withdrawnRows.map((w) => [w.key, new Date(w.value)]));

  // ---- races ---------------------------------------------------------------
  const raceNumbersOfRound = new Map<string, Set<number>>();
  for (const r of raceResults) {
    const set = raceNumbersOfRound.get(r.roundId) ?? new Set<number>();
    set.add(r.raceNumber);
    raceNumbersOfRound.set(r.roundId, set);
  }
  for (const t of teamResults) {
    const set = raceNumbersOfRound.get(t.roundId) ?? new Set<number>();
    set.add(t.raceNumber);
    raceNumbersOfRound.set(t.roundId, set);
  }
  const races: CrRace[] = [];
  const roundById = new Map(countingRounds.map((r) => [r.id, r]));
  for (const r of countingRounds) {
    const nums = [...(raceNumbersOfRound.get(r.id) ?? [])].sort((a, b) => a - b);
    for (const n of nums) {
      races.push({
        key: raceKeyOf(r.id, n),
        roundId: r.id,
        raceNumber: n,
        roundNumber: r.roundNumber,
        raceCount: nums.length,
        leagueSlug: r.season.league.slug,
        leagueName: r.season.league.name,
        seasonId: r.season.id,
        // Race 2 a little later than race 1, so "newest" orders them.
        at: new Date(r.startsAt.getTime() + (n - 1) * 60_000),
        open: CR_OPEN_LEAGUE_SLUGS.has(r.season.league.slug),
      });
    }
  }
  const raceByKey = new Map(races.map((x) => [x.key, x]));

  // ---- results -------------------------------------------------------------
  const results: CrResult[] = [];
  // Solo seasons: RaceResult, class field on multiclass seasons.
  const soloByRace = new Map<string, typeof raceResults>();
  for (const r of raceResults) {
    const season = roundById.get(r.roundId)?.season;
    if (!season || season.teamRegistration) continue;
    const cls = season.isMulticlass ? r.registration.carClassId ?? "" : "";
    const k = `${raceKeyOf(r.roundId, r.raceNumber)}|${cls}`;
    const list = soloByRace.get(k) ?? [];
    list.push(r);
    soloByRace.set(k, list);
  }
  for (const [k, rows] of soloByRace) {
    const raceKey = k.split("|")[0];
    const multiclass = roundById.get(rows[0].roundId)!.season.isMulticlass;
    const field = rows.map((r) => ({
      r,
      pos: (multiclass ? r.classPosition : null) ?? r.finishPosition,
      status: r.finishStatus as Status,
    }));
    const rank = rankField(field);
    const size = rank.size;
    for (const f of field) {
      if (f.status === "DNS") continue;
      results.push({
        raceKey,
        userId: f.r.registration.userId,
        position: rank.get(f)!,
        fieldSize: size,
        status: f.status,
        incidents: f.r.incidents,
        laps: f.r.lapsCompleted,
        penalty: 0,
      });
    }
  }
  // Team seasons (IEC): the car's class position, the driver's own incidents;
  // only who drove a stint.
  const teamByRace = new Map<string, typeof teamResults>();
  for (const t of teamResults) {
    const k = `${raceKeyOf(t.roundId, t.raceNumber)}|${t.carClassId ?? ""}`;
    const list = teamByRace.get(k) ?? [];
    list.push(t);
    teamByRace.set(k, list);
  }
  for (const [k, rows] of teamByRace) {
    const raceKey = k.split("|")[0];
    const field = rows.map((t) => ({ t, pos: t.classPosition ?? t.finishPosition, status: t.finishStatus as Status }));
    const rank = rankField(field);
    for (const f of field) {
      if (f.status === "DNS") continue;
      for (const d of f.t.participations) {
        if (d.lapsCompleted <= 0) continue;
        results.push({
          raceKey,
          userId: d.registration.userId,
          position: rank.get(f)!,
          fieldSize: rank.size,
          status: f.status,
          incidents: d.incidents,
          laps: d.lapsCompleted,
          penalty: 0,
        });
      }
    }
  }
  // One entry per driver and race (a driver in two IEC cars: the better one).
  const resultByUserRace = new Map<string, CrResult>();
  for (const r of results) {
    const k = `${r.userId}|${r.raceKey}`;
    const prev = resultByUserRace.get(k);
    if (!prev || r.position < prev.position) resultByUserRace.set(k, r);
  }

  // ---- penalties -----------------------------------------------------------
  const adjustments: CrAdjustment[] = [];
  for (const p of penalties) {
    const session = p.sourceIncidentDecision?.incidentReport.session;
    const raceNumber = session === "RACE_2" ? 2 : 1;
    const points = penaltyForLevel(p.categoryLevel);
    const userId = p.registration.userId;
    const keyed = raceByKey.get(raceKeyOf(p.roundId, raceNumber)) ?? raceByKey.get(raceKeyOf(p.roundId, 1));
    if (!keyed) continue;
    const entry = resultByUserRace.get(`${userId}|${keyed.key}`);
    if (entry) entry.penalty += points;
    else adjustments.push({ userId, raceKey: keyed.key, at: keyed.at, points, reason: "penalty" });
  }

  // ---- registrations -------------------------------------------------------
  const crRegs: CrRegistration[] = [];
  // No-show penalty only from approval on (time on the waiting list is free).
  const noShowFrom = new Map<CrRegistration, Date>();
  for (const r of registrations) {
    const season = seasonById.get(r.seasonId)!;
    const u = r.user;
    names.set(r.userId, u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "?");
    if (CR_OPEN_LEAGUE_SLUGS.has(season.league.slug)) continue;
    if (r.status === "APPROVED" && r.waitlistedAt) continue; // not on the grid
    const withdrawn =
      r.status === "WITHDRAWN" ? withdrawnAt.get(crWithdrawnKey(r.id)) ?? r.updatedAt : null;
    const ends = [withdrawn, r.retiredAt, r.excludedAt].filter((d): d is Date => !!d);
    const reg: CrRegistration = {
      userId: r.userId,
      leagueSlug: season.league.slug,
      seasonId: r.seasonId,
      from: r.createdAt,
      until: ends.length ? new Date(Math.min(...ends.map((d) => d.getTime()))) : null,
      seasonEndsAt:
        season.status === "COMPLETED" ? season.rounds[season.rounds.length - 1]?.startsAt ?? null : null,
    };
    crRegs.push(reg);
    if (!season.teamRegistration) {
      noShowFrom.set(reg, r.approvedAt && r.approvedAt > r.createdAt ? r.approvedAt : r.createdAt);
    }
  }

  // ---- streams (official CAS stream calendar only) -------------------------
  const streams: CrStream[] = [];
  const streamerIds = cfg.streamers;
  if (Object.keys(streamerIds).length > 0 && countingRounds.length > 0) {
    const cal = buildStreamCalendar(
      countingRounds.map((r) => ({
        id: r.id,
        seasonId: r.season.id,
        leagueSlug: r.season.league.slug,
        roundNumber: r.roundNumber,
        name: "",
        track: "",
        startsAt: r.startsAt,
      })),
      new Map(streamRows.map((s) => [s.key, s.value]))
    );
    for (const w of cal.weeks) {
      for (const race of w.races) {
        if (race.planned) continue;
        const userId = (STREAMERS as readonly string[]).includes(race.streamer)
          ? streamerIds[race.streamer]
          : undefined;
        if (!userId) continue;
        const roundId = race.key.replace(/^stream-calendar:round:/, "");
        for (const x of races) if (x.roundId === roundId) streams.push({ userId, raceKey: x.key });
      }
    }
  }
  const streamedRound = new Set(streams.map((s) => `${s.userId}|${raceByKey.get(s.raceKey)!.roundId}`));

  // ---- no-show without declining (-5 once per round) -----------------------
  const declinedSet = new Set(declined.map((d) => `${d.registration.userId}|${d.roundId}`));
  const drovRound = new Set([...resultByUserRace.values()].map((r) => `${r.userId}|${raceByKey.get(r.raceKey)!.roundId}`));
  // Team seasons (IEC) have none: a crew never puts every driver in the car.
  for (const [reg, from] of noShowFrom) {
    for (const round of countingRounds) {
      if (round.season.id !== reg.seasonId) continue;
      if (round.startsAt < from || (reg.until && round.startsAt > reg.until)) continue;
      const k = `${reg.userId}|${round.id}`;
      if (drovRound.has(k) || declinedSet.has(k) || streamedRound.has(k)) continue;
      const first = races.find((x) => x.roundId === round.id);
      if (!first) continue; // no results imported
      adjustments.push({ userId: reg.userId, raceKey: first.key, at: first.at, points: CR_NO_SHOW, reason: "no-show" });
    }
  }

  // Names of drivers who only raced as fill-ins / streamed.
  const missing = [...new Set([...resultByUserRace.values()].map((r) => r.userId).concat(streams.map((s) => s.userId)))].filter(
    (id) => !names.has(id)
  );
  if (missing.length) {
    const users = await prisma.user.findMany({
      where: { id: { in: missing } },
      select: { id: true, name: true, firstName: true, lastName: true },
    });
    for (const u of users) names.set(u.id, u.name || [u.firstName, u.lastName].filter(Boolean).join(" ") || "?");
  }

  return {
    input: { races, results: [...resultByUserRace.values()], adjustments, registrations: crRegs, streams },
    config: cfg,
    names,
  };
}

/** Everything a page needs: the engine plus the driver names. */
export async function loadCasRating(prisma: PrismaClient) {
  const { input, config, names } = await loadCasRatingInput(prisma);
  return { engine: buildCasRating(input), input, config, names };
}

/**
 * Remember when a driver withdrew from a season (CLS has no column for it):
 * the attendance is frozen there. Keeps the FIRST date — a later edit of an
 * already withdrawn registration does not move it. Never throws.
 */
export async function stampCrWithdrawn(
  db: Pick<PrismaClient, "appSetting">,
  registrationId: string,
  at: Date = new Date()
): Promise<void> {
  try {
    await db.appSetting.upsert({
      where: { key: crWithdrawnKey(registrationId) },
      update: {},
      create: { key: crWithdrawnKey(registrationId), value: at.toISOString() },
    });
  } catch {
    /* the rating falls back to updatedAt */
  }
}

/** Forget it again when the registration is reinstated. Never throws. */
export async function clearCrWithdrawn(
  db: Pick<PrismaClient, "appSetting">,
  registrationId: string
): Promise<void> {
  try {
    await db.appSetting.deleteMany({ where: { key: crWithdrawnKey(registrationId) } });
  } catch {
    /* ignore */
  }
}

// ---- short in-process cache for the nav badge and the driver page ---------
// The app is one standalone Node process, so a module-level memo is enough.
// A published result or decision shows up within CR_CACHE_MS; saving the
// admin settings clears it at once.
const CR_CACHE_MS = 2 * 60_000;
let crCache: { at: number; value: Promise<Awaited<ReturnType<typeof loadCasRating>>> } | null = null;

export function getCasRatingCached(prisma: PrismaClient) {
  if (!crCache || Date.now() - crCache.at > CR_CACHE_MS) {
    const value = loadCasRating(prisma);
    crCache = { at: Date.now(), value };
    // A failed load must not stick for two minutes.
    value.catch(() => {
      if (crCache?.value === value) crCache = null;
    });
  }
  return crCache.value;
}

export function clearCasRatingCache(): void {
  crCache = null;
}
