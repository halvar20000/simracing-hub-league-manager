/**
 * Upload endpoint for the standalone iRacing Race Logger.
 *
 * The logger runs on the driver's Windows PC during a race and POSTs the
 * finished `…_race.jsonl` here, authenticated with the personal token from
 * /race-logger. The file is validated with the same parser Driver of the Day
 * uses, archived to Blob and indexed as a RaceLogUpload row so an admin can
 * pick it on the Race Center page instead of chasing log files in Discord.
 *
 *   GET  /api/race-log   → token check ("Test connection" in the logger)
 *   POST /api/race-log   → upload a .jsonl (multipart `file`, or raw body)
 *
 * Auth: `Authorization: Bearer <token>` (or `X-Logger-Token`).
 */
import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import {
  tokenFromRequest,
  userByRaceLoggerToken,
  displayName,
  extractRaceLogMeta,
  matchRoundForLog,
  sha256Hex,
} from "@/lib/race-logger";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/** Race logs are a few MB; 60 MB matches the manual DotD upload limit. */
export const maxDuration = 60;

const MAX_BYTES = 60 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "race.jsonl";
  const clean = base.replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120);
  return clean || "race.jsonl";
}

export async function GET(req: NextRequest) {
  const user = await userByRaceLoggerToken(tokenFromRequest(req));
  if (!user) return json({ ok: false, error: "Invalid or unknown logger token" }, 401);

  const [count, last] = await Promise.all([
    prisma.raceLogUpload.count({ where: { uploadedById: user.id } }),
    prisma.raceLogUpload.findFirst({
      where: { uploadedById: user.id },
      orderBy: { createdAt: "desc" },
      select: { fileName: true, createdAt: true },
    }),
  ]);

  return json({
    ok: true,
    driver: displayName(user),
    uploads: count,
    lastUpload: last ? { fileName: last.fileName, at: last.createdAt.toISOString() } : null,
  });
}

export async function POST(req: NextRequest) {
  const user = await userByRaceLoggerToken(tokenFromRequest(req));
  if (!user) return json({ ok: false, error: "Invalid or unknown logger token" }, 401);

  // --- read the file (multipart from requests/urllib, or a raw body) ---
  let text: string;
  let fileName: string;
  let clientVersion: string | null = req.headers.get("x-logger-version");

  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const f = form.get("file");
      if (!(f instanceof File) || f.size === 0) {
        return json({ ok: false, error: "No file in the request (field 'file')" }, 400);
      }
      if (f.size > MAX_BYTES) {
        return json({ ok: false, error: "Log too large (max 60 MB)" }, 413);
      }
      text = await f.text();
      fileName = safeFileName(String(form.get("filename") ?? f.name ?? "race.jsonl"));
      const v = form.get("client_version");
      if (typeof v === "string" && v) clientVersion = v;
    } else {
      text = await req.text();
      if (text.length > MAX_BYTES) {
        return json({ ok: false, error: "Log too large (max 60 MB)" }, 413);
      }
      fileName = safeFileName(req.headers.get("x-log-filename") ?? "race.jsonl");
    }
  } catch {
    return json({ ok: false, error: "Could not read the uploaded file" }, 400);
  }

  if (!text.trim()) return json({ ok: false, error: "The log file is empty" }, 400);

  // --- validate with the Driver-of-the-Day parser ---
  const meta = extractRaceLogMeta(text);
  if (!meta.ok) {
    return json(
      { ok: false, error: `Not a usable race log: ${meta.error ?? "unknown format"}` },
      422
    );
  }

  // --- idempotency: the same bytes from the same driver never duplicate ---
  const sha256 = sha256Hex(text);
  const existing = await prisma.raceLogUpload.findUnique({
    where: { uploadedById_sha256: { uploadedById: user.id, sha256 } },
    include: { round: { select: { roundNumber: true, name: true } } },
  });
  if (existing) {
    return json({
      ok: true,
      duplicate: true,
      id: existing.id,
      round: existing.round
        ? { label: `R${existing.round.roundNumber} ${existing.round.name}` }
        : null,
      message: "This log was already uploaded — nothing to do.",
    });
  }

  // --- archive + index ---
  const blob = await put(`race-logs/${user.id}/${fileName}`, text, {
    access: "public",
    contentType: "application/x-ndjson",
    addRandomSuffix: true,
  });

  const round = await matchRoundForLog(
    user.id,
    { track: meta.track, startedAt: meta.startedAt },
    new Date()
  );

  const row = await prisma.raceLogUpload.create({
    data: {
      uploadedById: user.id,
      fileName,
      blobUrl: blob.url,
      sizeBytes: Buffer.byteLength(text, "utf8"),
      sha256,
      track: meta.track,
      trackConfig: meta.trackConfig,
      sessionName: meta.sessionName,
      sessionNum: meta.sessionNum,
      sessionUniqueId: meta.sessionUniqueId,
      official: meta.official,
      driverCount: meta.driverCount,
      lapEvents: meta.lapEvents,
      startedAt: meta.startedAt,
      roundId: round?.id ?? null,
      matchedAutomatically: Boolean(round),
      clientVersion,
    },
    select: { id: true },
  });

  return json({
    ok: true,
    duplicate: false,
    id: row.id,
    track: meta.track,
    drivers: meta.driverCount,
    laps: meta.lapEvents,
    round: round
      ? {
          label: `R${round.roundNumber} ${round.name} — ${round.leagueName}`,
          url: `/leagues/${round.leagueSlug}/seasons/${round.seasonId}/rounds/${round.id}`,
        }
      : null,
    message: round
      ? `Uploaded and matched to R${round.roundNumber} ${round.name}.`
      : "Uploaded. No round matched automatically — an admin will assign it.",
  });
}
