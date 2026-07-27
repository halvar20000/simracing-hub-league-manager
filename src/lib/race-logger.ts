/**
 * Standalone iRacing Race Logger — server-side helpers.
 *
 * The logger (iracing_race_logger.py from the iRacing-overlays project, also
 * shipped as a single-file RaceLogger.exe) records a race as JSONL and, when
 * the driver has pasted a personal token into its setup page, POSTs the
 * finished file to `/api/race-log`. This module holds everything both the API
 * route and the server actions need:
 *
 *   - token minting / lookup            (per User, regenerable)
 *   - content hashing                   (idempotent re-uploads)
 *   - metadata extraction from the log  (track, session, driver count)
 *   - automatic round matching          (track + date + the driver's seasons)
 *
 * Pure-ish: no "use server" so API routes may import it safely
 * (see CLAUDE.md — API routes importing a "use server" file get dropped).
 */
import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { parseDotdLog } from "@/lib/dotd-log";

/** Prefix makes a leaked token obvious in logs/screenshots. */
export const RACE_LOGGER_TOKEN_PREFIX = "cls_rl_";

/** Where drivers download the logger. Public GitHub release of the overlays repo. */
export const RACE_LOGGER_EXE_URL =
  "https://github.com/halvar20000/iracing-overlays/releases/latest/download/RaceLogger.exe";
export const RACE_LOGGER_ZIP_URL =
  "https://github.com/halvar20000/iracing-overlays/releases/latest/download/RaceLogger-source.zip";

export function generateRaceLoggerToken(): string {
  return RACE_LOGGER_TOKEN_PREFIX + randomBytes(24).toString("base64url");
}

/** "cls_rl_ab12…z9" — safe to render on screen next to a copy button. */
export function maskToken(token: string): string {
  if (token.length <= 14) return token;
  return `${token.slice(0, 11)}…${token.slice(-4)}`;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Reads the bearer token from an incoming logger request. */
export function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  if (m) return m[1].trim();
  const header = req.headers.get("x-logger-token");
  return header ? header.trim() : null;
}

export type RaceLoggerUser = {
  id: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
};

export async function userByRaceLoggerToken(token: string | null): Promise<RaceLoggerUser | null> {
  if (!token || !token.startsWith(RACE_LOGGER_TOKEN_PREFIX)) return null;
  const user = await prisma.user.findUnique({
    where: { raceLoggerToken: token },
    select: { id: true, name: true, firstName: true, lastName: true, isActive: true },
  });
  if (!user || !user.isActive) return null;
  const { isActive: _isActive, ...rest } = user;
  return rest;
}

export function displayName(u: RaceLoggerUser): string {
  const full = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return full || u.name || "Driver";
}

// ---------------------------------------------------------------------------
// Log metadata
// ---------------------------------------------------------------------------

export type RaceLogMeta = {
  ok: boolean;
  error: string | null;
  track: string | null;
  trackConfig: string | null;
  sessionName: string | null;
  sessionNum: number | null;
  sessionUniqueId: number | null;
  official: boolean | null;
  driverCount: number;
  lapEvents: number;
  startedAt: Date | null;
};

/**
 * Validate + summarise an uploaded .jsonl. Reuses the Driver-of-the-Day
 * parser so a file that would be rejected at DotD time is rejected here,
 * at upload, while the driver is still sitting in front of the logger.
 */
export function extractRaceLogMeta(text: string): RaceLogMeta {
  const parsed = parseDotdLog(text);
  const base: RaceLogMeta = {
    ok: parsed.ok,
    error: parsed.error,
    track: parsed.track,
    trackConfig: parsed.trackConfig,
    sessionName: parsed.sessionName,
    sessionNum: parsed.sessionNum,
    sessionUniqueId: parsed.sessionUniqueId,
    official: parsed.official,
    driverCount: parsed.drivers.length,
    lapEvents: 0,
    startedAt: null,
  };
  if (!parsed.ok) return base;

  // Count lap events + read the session_start wall clock. Cheap line scan —
  // parseDotdLog already walked the file, but it does not surface either.
  let laps = 0;
  let startedAt: Date | null = null;
  for (const line of text.split("\n")) {
    const s = line.trim();
    if (!s || s[0] !== "{") continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(s) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (ev.type === "lap") laps++;
    else if (ev.type === "session_start" && !startedAt && typeof ev.t_wall === "string") {
      const d = new Date(ev.t_wall);
      if (!Number.isNaN(d.getTime())) startedAt = d;
    }
  }
  base.lapEvents = laps;
  base.startedAt = startedAt;
  return base;
}

// ---------------------------------------------------------------------------
// Round matching
// ---------------------------------------------------------------------------

/** Loose track comparison: "Spa-Francorchamps" ~ "spa francorchamps grand prix". */
function trackKey(s: string | null | undefined): string {
  return String(s ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function tracksLookAlike(a: string | null | undefined, b: string | null | undefined): boolean {
  const ka = trackKey(a);
  const kb = trackKey(b);
  if (!ka || !kb) return false;
  return ka === kb || ka.includes(kb) || kb.includes(ka);
}

/** How far a log's session start may sit from the round's scheduled start. */
const MATCH_WINDOW_MS = 36 * 60 * 60 * 1000;

export type MatchedRound = {
  id: string;
  name: string;
  roundNumber: number;
  track: string;
  startsAt: Date;
  seasonId: string;
  leagueSlug: string;
  leagueName: string;
  seasonName: string;
};

/**
 * Find the round an uploaded log most likely belongs to: a round of a season
 * the uploader is registered in, scheduled within ±36 h of the log, preferring
 * one whose track name looks like the log's track. Returns null when that is
 * ambiguous — an admin then assigns it by hand on the Race Center page.
 */
export async function matchRoundForLog(
  userId: string,
  meta: { track: string | null; startedAt: Date | null },
  fallbackTime: Date
): Promise<MatchedRound | null> {
  const when = meta.startedAt ?? fallbackTime;
  const rounds = await prisma.round.findMany({
    where: {
      startsAt: {
        gte: new Date(when.getTime() - MATCH_WINDOW_MS),
        lte: new Date(when.getTime() + MATCH_WINDOW_MS),
      },
      season: { registrations: { some: { userId } } },
    },
    select: {
      id: true,
      name: true,
      roundNumber: true,
      track: true,
      startsAt: true,
      seasonId: true,
      season: {
        select: { name: true, league: { select: { slug: true, name: true } } },
      },
    },
  });
  if (rounds.length === 0) return null;

  const withTrack = rounds.filter((r) => tracksLookAlike(r.track, meta.track));
  const pool = withTrack.length > 0 ? withTrack : rounds;
  // Unambiguous only: several rounds at the same track in the same 3-day
  // window means we cannot tell them apart — let a human decide.
  if (pool.length > 1) {
    pool.sort(
      (a, b) =>
        Math.abs(a.startsAt.getTime() - when.getTime()) -
        Math.abs(b.startsAt.getTime() - when.getTime())
    );
    const closest = Math.abs(pool[0].startsAt.getTime() - when.getTime());
    const runnerUp = Math.abs(pool[1].startsAt.getTime() - when.getTime());
    // Accept the closest one only when it is clearly closer (> 6 h apart).
    if (runnerUp - closest < 6 * 60 * 60 * 1000) return null;
  }
  const r = pool[0];
  return {
    id: r.id,
    name: r.name,
    roundNumber: r.roundNumber,
    track: r.track,
    startsAt: r.startsAt,
    seasonId: r.seasonId,
    leagueSlug: r.season.league.slug,
    leagueName: r.season.league.name,
    seasonName: r.season.name,
  };
}
