"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { parseIracingEventJson, IracingJsonParseError } from "@/lib/iracing-json";
import { parseDotdLog, normalizeName } from "@/lib/dotd-log";
import {
  computeDriverOfTheDay,
  combineRaceCandidates,
  type DotdCandidate,
  type DotdRow,
  type DotdResult,
} from "@/lib/driver-of-the-day";
import type { ParsedDriver, ParsedSession } from "@/lib/iracing-json";
import type { ParsedDotdLog } from "@/lib/dotd-log";

const ACCEPT_JSON = ["application/json", "text/json", "text/plain", "application/octet-stream"];
const MAX_JSON_BYTES = 10 * 1024 * 1024; // eventresult JSONs are <1 MB
const MAX_LOG_BYTES = 60 * 1024 * 1024; // race-logger JSONL can be a few MB
const RANKING_TOP = 15;

function adminPath(slug: string, seasonId: string, roundId: string): string {
  return `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/race-center`;
}
function publicRoundPath(slug: string, seasonId: string, roundId: string): string {
  return `/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;
}
function blobBase(slug: string, seasonId: string, roundNumber: number): string {
  return `driver-of-the-day/${slug}/${seasonId}/${roundNumber}`;
}

async function resolveContext(formData: FormData) {
  await requireAdmin();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!leagueSlug || !seasonId || !roundId) {
    throw new Error("Missing leagueSlug/seasonId/roundId");
  }
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      driverOfTheDay: true,
    },
  });
  if (!round || round.season.league.slug !== leagueSlug || round.seasonId !== seasonId) {
    throw new Error("Round not found in this league/season");
  }
  return { leagueSlug, seasonId, roundId, round };
}

type RankingEntry = {
  rank: number;
  name: string;
  carNumber: string | null;
  userId: string | null;
  carClassShortName: string | null;
  score: number;
  positionsGained: number;
  recovery: number;
  overtakes: number;
  incidents: number;
  startPos: number | null;
  finishPos: number | null;
  worstPos: number | null;
  eligible: boolean;
  blockedRepeat: boolean;
  why: string;
};

function toRanking(rows: DotdRow[], top = RANKING_TOP): RankingEntry[] {
  return rows.slice(0, top).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    carNumber: r.carNumber,
    userId: r.userId,
    carClassShortName: r.carClassShortName,
    score: r.score,
    positionsGained: r.positionsGained,
    recovery: r.recovery,
    overtakes: r.overtakes,
    incidents: r.incidents,
    startPos: r.startPos,
    finishPos: r.finishPos,
    worstPos: r.worstPos,
    eligible: r.eligible,
    blockedRepeat: r.blockedRepeat,
    why: r.why,
  }));
}

type ClassWinner = {
  carClassShortName: string;
  winnerUserId: string | null;
  winnerName: string;
  winnerCarNumber: string | null;
  score: number;
  ranking: RankingEntry[];
};

/**
 * Compute (or recompute) Driver of the Day for a round from an uploaded
 * eventresult JSON + race-logger JSONL. Archives both raw files to Blob and
 * upserts the RoundDriverOfTheDay row. Recognition only — no points.
 */
export async function computeAndSaveDotd(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId, round } = await resolveContext(formData);
  const fail = (msg: string): never =>
    redirect(adminPath(leagueSlug, seasonId, roundId) + "?error=" + encodeURIComponent(msg));

  const eventFile = formData.get("eventResult");
  // Accept one log per race (two-race/heat rounds upload two). Backward-compat:
  // also accept the legacy single "log" field name.
  const logFiles = [...formData.getAll("logs"), ...formData.getAll("log")].filter(
    (f): f is File => f instanceof File && f.size > 0
  );
  if (!(eventFile instanceof File) || eventFile.size === 0) fail("Upload the iRacing eventresult JSON");
  if (logFiles.length === 0) fail("Upload the race-logger log (.jsonl) — one per race");
  const ev = eventFile as File;
  if (ev.size > MAX_JSON_BYTES) fail("eventresult JSON too large (max 10 MB)");
  for (const lg of logFiles) {
    if (lg.size > MAX_LOG_BYTES) fail(`Log "${lg.name}" too large (max 60 MB)`);
  }

  // --- parse eventresult (authoritative start/finish/incidents + identity) ---
  const eventText = await ev.text();
  let parsed;
  try {
    parsed = parseIracingEventJson(JSON.parse(eventText));
  } catch (e) {
    if (e instanceof IracingJsonParseError) fail(e.message);
    fail("Could not parse eventresult JSON");
    return;
  }
  // Every RACE session in the file, in race order (1, 2, …). Two-race rounds
  // carry two here (e.g. HEAT 1 + FEATURE); single-race rounds carry one.
  const raceSessions = parsed.sessions.filter((s) => s.kind === "RACE" && s.drivers.length > 0);
  if (raceSessions.length === 0) fail("No RACE session found in eventresult JSON");

  // --- parse every uploaded log ---
  const logTexts = await Promise.all(logFiles.map((f) => f.text()));
  const logs = logTexts.map((t) => parseDotdLog(t));
  const badLog = logs.find((l) => !l.ok);
  if (badLog) fail("Could not read a log: " + (badLog.error ?? "unknown error"));

  // Require one log per race.
  if (logs.length !== raceSessions.length) {
    fail(
      `This round has ${raceSessions.length} race${raceSessions.length === 1 ? "" : "s"} in the ` +
        `eventresult — upload exactly ${raceSessions.length} log file${raceSessions.length === 1 ? "" : "s"} ` +
        `(you uploaded ${logs.length}).`
    );
  }

  // --- match each RACE session to its log (by iRacing session number, else order) ---
  const orderedLogs = matchLogsToRaces(raceSessions, logs);

  // --- identity bridge: cust_id -> User.iracingMemberId (across all races) ---
  const custIds = Array.from(
    new Set(
      raceSessions.flatMap((s) =>
        s.drivers.map((d) => d.custId).filter((n): n is number => typeof n === "number" && n > 0)
      )
    )
  );
  const users = await prisma.user.findMany({
    where: { iracingMemberId: { in: custIds.map((n) => String(n)) } },
    select: { id: true, iracingMemberId: true },
  });
  const userByCust = new Map<string, string>();
  for (const u of users) if (u.iracingMemberId) userByCust.set(u.iracingMemberId, u.id);

  // --- build per-race candidate lists, then combine when there are 2+ races ---
  const perRace: DotdCandidate[][] = raceSessions.map((session, i) =>
    buildCandidatesForRace(session, orderedLogs[i], userByCust)
  );
  const isMultiRace = raceSessions.length > 1;
  const scored: DotdCandidate[] = isMultiRace ? combineRaceCandidates(perRace) : perRace[0];

  // --- no-back-to-back: previous round's winner in this season ---
  const prevRound = await prisma.round.findFirst({
    where: {
      seasonId,
      roundNumber: { lt: round.roundNumber },
      driverOfTheDay: { isNot: null },
    },
    orderBy: { roundNumber: "desc" },
    include: { driverOfTheDay: true },
  });
  const prevDotd = prevRound?.driverOfTheDay ?? null;
  const prevWinnerUserId = prevDotd?.winnerUserId ?? null;
  const prevWinnerName = prevDotd?.winnerName ?? null;
  const prevClassWinners: ClassWinner[] = Array.isArray(prevDotd?.classWinners)
    ? (prevDotd!.classWinners as unknown as ClassWinner[])
    : [];

  // --- overall award ---
  const overall: DotdResult = computeDriverOfTheDay(scored, {
    excludeUserIds: prevWinnerUserId ? [prevWinnerUserId] : [],
    excludeNames: !prevWinnerUserId && prevWinnerName ? [prevWinnerName] : [],
  });
  if (!overall.ok || !overall.winner) {
    fail(
      isMultiRace
        ? "No eligible Driver of the Day (no driver was classified in both races)"
        : "No eligible Driver of the Day (all drivers DNF or under distance)"
    );
  }
  const w = overall.winner!;

  // --- per-car-class winners (multiclass only) ---
  const classWinners: ClassWinner[] = [];
  if (round.season.isMulticlass) {
    const classes = new Map<string, DotdCandidate[]>();
    for (const c of scored) {
      const key = c.carClassShortName ?? "";
      if (!key) continue;
      if (!classes.has(key)) classes.set(key, []);
      classes.get(key)!.push(c);
    }
    for (const [shortName, list] of classes) {
      const prevClass = prevClassWinners.find((p) => p.carClassShortName === shortName);
      const res = computeDriverOfTheDay(list, {
        excludeUserIds: prevClass?.winnerUserId ? [prevClass.winnerUserId] : [],
        excludeNames: !prevClass?.winnerUserId && prevClass?.winnerName ? [prevClass.winnerName] : [],
      });
      if (res.ok && res.winner) {
        classWinners.push({
          carClassShortName: shortName,
          winnerUserId: res.winner.userId,
          winnerName: res.winner.name,
          winnerCarNumber: res.winner.carNumber,
          score: res.winner.score,
          ranking: toRanking(res.drivers, 8),
        });
      }
    }
    classWinners.sort((a, b) => a.carClassShortName.localeCompare(b.carClassShortName));
  }

  // --- archive raw uploads to Blob (allowDelete + overwrite on recompute) ---
  const base = blobBase(leagueSlug, seasonId, round.roundNumber);
  // clean up previous archives if recomputing
  const oldUrls = [
    round.driverOfTheDay?.eventResultBlobUrl,
    round.driverOfTheDay?.logBlobUrl,
    ...(round.driverOfTheDay?.extraLogBlobUrls ?? []),
  ];
  for (const old of oldUrls) {
    if (old) {
      try {
        await del(old);
      } catch {
        /* ignore */
      }
    }
  }
  const evBlob = await put(`${base}/eventresult.json`, eventText, {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: true,
  });
  const logBlobs = await Promise.all(
    logTexts.map((t, i) =>
      put(`${base}/race-log-${i + 1}.jsonl`, t, {
        access: "public",
        contentType: "application/x-ndjson",
        addRandomSuffix: true,
      })
    )
  );

  const winnerMetrics = {
    startPos: w.startPos,
    finishPos: w.finishPos,
    worstPos: w.worstPos,
    positionsGained: w.positionsGained,
    recovery: w.recovery,
    overtakes: w.overtakes,
    incidents: w.incidents,
  };

  // previousWinnerBlocked = did the streak rule actually exclude a driver who
  // appears in the ranking? True when the previous round's winner raced again.
  const blockedSomeone = overall.drivers.some((r) => r.blockedRepeat);

  const data = {
    winnerUserId: w.userId,
    winnerName: w.name,
    winnerCarNumber: w.carNumber,
    score: w.score,
    breakdown: w.components as unknown as object,
    winnerMetrics: winnerMetrics as unknown as object,
    ranking: toRanking(overall.drivers) as unknown as object,
    classWinners: classWinners as unknown as object,
    weightsProfile: overall.weightsProfile,
    weights: overall.weights as unknown as object,
    previousWinnerUserId: prevWinnerUserId,
    previousWinnerName: prevWinnerName,
    previousWinnerBlocked: blockedSomeone,
    eventResultBlobUrl: evBlob.url,
    logBlobUrl: logBlobs[0]?.url ?? null,
    extraLogBlobUrls: logBlobs.slice(1).map((b) => b.url),
    computedAt: new Date(),
  };

  await prisma.roundDriverOfTheDay.upsert({
    where: { roundId },
    create: { roundId, ...data },
    update: data,
  });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  revalidatePath(adminPath(leagueSlug, seasonId, roundId));
  redirect(
    adminPath(leagueSlug, seasonId, roundId) +
      "?ok=" +
      encodeURIComponent(
        `Driver of the Day: ${w.name} (score ${w.score.toFixed(3)})` +
          (isMultiRace ? ` — combined over ${raceSessions.length} races` : "")
      )
  );
}

/**
 * Delete the round's Driver of the Day (with Blob cleanup of the archived
 * raw uploads).
 */
export async function deleteDotd(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId, round } = await resolveContext(formData);
  if (round.driverOfTheDay) {
    for (const url of [
      round.driverOfTheDay.eventResultBlobUrl,
      round.driverOfTheDay.logBlobUrl,
      ...(round.driverOfTheDay.extraLogBlobUrls ?? []),
    ]) {
      if (url) {
        try {
          await del(url);
        } catch {
          /* ignore */
        }
      }
    }
    await prisma.roundDriverOfTheDay.delete({ where: { roundId } });
  }
  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  revalidatePath(adminPath(leagueSlug, seasonId, roundId));
  redirect(adminPath(leagueSlug, seasonId, roundId) + "?ok=Driver+of+the+Day+removed");
}

// ---------------------------------------------------------------------------
// helpers

/**
 * Pair each RACE session with its log. Prefer matching by iRacing session
 * number (log.sessionNum ↔ session.simSessionNumber, robust to upload order);
 * fall back to upload order when the numbers don't line up.
 */
function matchLogsToRaces(
  raceSessions: ParsedSession[],
  logs: ParsedDotdLog[]
): ParsedDotdLog[] {
  const byNum = new Map<number, ParsedDotdLog>();
  for (const l of logs) if (typeof l.sessionNum === "number") byNum.set(l.sessionNum, l);
  const allMatch = raceSessions.every((s) => byNum.has(s.simSessionNumber));
  if (allMatch && byNum.size === logs.length) {
    return raceSessions.map((s) => byNum.get(s.simSessionNumber)!);
  }
  // Fallback: logs sorted by sessionNum (races are already in race order).
  const sorted = [...logs].sort((a, b) => (a.sessionNum ?? 0) - (b.sessionNum ?? 0));
  return raceSessions.map((_, i) => sorted[i] ?? logs[i]);
}

/**
 * Join one RACE session's eventresult drivers with the matched log (overtakes +
 * worst position), resolving each to a CLS user via cust_id.
 */
function buildCandidatesForRace(
  session: ParsedSession,
  log: ParsedDotdLog,
  userByCust: Map<string, string>
): DotdCandidate[] {
  return session.drivers.map((d: ParsedDriver) => {
    const logDriver =
      (d.carNumber ? log.byCarNumber.get(d.carNumber.trim()) : undefined) ??
      log.byName.get(normalizeName(d.displayName)) ??
      null;
    return {
      custId: d.custId ?? null,
      userId: (d.custId != null ? userByCust.get(String(d.custId)) : undefined) ?? null,
      name: d.displayName,
      carNumber: d.carNumber,
      carClassShortName: d.carClassShortName,
      startPos: d.startingPosition,
      finishPos: d.finishPosition,
      worstPos: logDriver?.worstPosition ?? d.finishPosition,
      overtakes: logDriver?.overtakes ?? 0,
      incidents: d.incidents,
      lapsCompleted: d.lapsComplete,
      finishStatus: d.finishStatus,
    };
  });
}
