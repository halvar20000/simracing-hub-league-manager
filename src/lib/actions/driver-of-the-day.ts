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
  type DotdCandidate,
  type DotdRow,
  type DotdResult,
} from "@/lib/driver-of-the-day";

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
  const logFile = formData.get("log");
  if (!(eventFile instanceof File) || eventFile.size === 0) fail("Upload the iRacing eventresult JSON");
  if (!(logFile instanceof File) || logFile.size === 0) fail("Upload the race-logger log (.jsonl)");
  const ev = eventFile as File;
  const lg = logFile as File;
  if (ev.size > MAX_JSON_BYTES) fail("eventresult JSON too large (max 10 MB)");
  if (lg.size > MAX_LOG_BYTES) fail("Log file too large (max 60 MB)");
  if (ev.type && !ACCEPT_JSON.includes(ev.type)) {
    // not fatal — file managers mis-tag JSON; parse will catch real problems
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
  const raceSession = [...parsed.sessions].reverse().find((s) => s.kind === "RACE");
  if (!raceSession || raceSession.drivers.length === 0) fail("No RACE session found in eventresult JSON");
  const evDrivers = raceSession!.drivers;

  // --- parse race-logger JSONL (overtakes + worst position) ---
  const logText = await lg.text();
  const log = parseDotdLog(logText);
  if (!log.ok) fail("Could not read the log: " + (log.error ?? "unknown error"));

  // --- identity bridge: cust_id -> User.iracingMemberId ---
  const custIds = evDrivers.map((d) => d.custId).filter((n): n is number => typeof n === "number" && n > 0);
  const users = await prisma.user.findMany({
    where: { iracingMemberId: { in: custIds.map((n) => String(n)) } },
    select: { id: true, iracingMemberId: true },
  });
  const userByCust = new Map<string, string>();
  for (const u of users) if (u.iracingMemberId) userByCust.set(u.iracingMemberId, u.id);

  // --- join eventresult driver <- log driver (by car number, then name) ---
  const candidates: DotdCandidate[] = evDrivers.map((d) => {
    const logDriver =
      (d.carNumber ? log.byCarNumber.get(d.carNumber.trim()) : undefined) ??
      log.byName.get(normalizeName(d.displayName)) ??
      null;
    const overtakes = logDriver?.overtakes ?? 0;
    const worstPos = logDriver?.worstPosition ?? d.finishPosition;
    return {
      custId: d.custId ?? null,
      userId: (d.custId != null ? userByCust.get(String(d.custId)) : undefined) ?? null,
      name: d.displayName,
      carNumber: d.carNumber,
      carClassShortName: d.carClassShortName,
      startPos: d.startingPosition,
      finishPos: d.finishPosition,
      worstPos,
      overtakes,
      incidents: d.incidents,
      lapsCompleted: d.lapsComplete,
      finishStatus: d.finishStatus,
    };
  });

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
  const overall: DotdResult = computeDriverOfTheDay(candidates, {
    excludeUserIds: prevWinnerUserId ? [prevWinnerUserId] : [],
    excludeNames: !prevWinnerUserId && prevWinnerName ? [prevWinnerName] : [],
  });
  if (!overall.ok || !overall.winner) {
    fail("No eligible Driver of the Day (all drivers DNF or under distance)");
  }
  const w = overall.winner!;

  // --- per-car-class winners (multiclass only) ---
  const classWinners: ClassWinner[] = [];
  if (round.season.isMulticlass) {
    const classes = new Map<string, DotdCandidate[]>();
    for (const c of candidates) {
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
  for (const old of [round.driverOfTheDay?.eventResultBlobUrl, round.driverOfTheDay?.logBlobUrl]) {
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
  const logBlob = await put(`${base}/race-log.jsonl`, logText, {
    access: "public",
    contentType: "application/x-ndjson",
    addRandomSuffix: true,
  });

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
    logBlobUrl: logBlob.url,
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
      encodeURIComponent(`Driver of the Day: ${w.name} (score ${w.score.toFixed(3)})`)
  );
}

/**
 * Delete the round's Driver of the Day (with Blob cleanup of the archived
 * raw uploads).
 */
export async function deleteDotd(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId, round } = await resolveContext(formData);
  if (round.driverOfTheDay) {
    for (const url of [round.driverOfTheDay.eventResultBlobUrl, round.driverOfTheDay.logBlobUrl]) {
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
