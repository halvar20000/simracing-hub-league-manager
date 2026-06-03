"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  defaultSortOrderForChartType,
  defaultTitleForChartType,
  isValidChartType,
} from "@/lib/race-center-charts";
import { extractWeatherFromEventResult } from "@/lib/iracing-weather";

const ACCEPT_IMG = ["image/png", "image/jpeg", "image/webp"];
const ACCEPT_VIDEO = ["video/mp4", "video/webm", "video/quicktime"];
const ACCEPT_JSON = ["application/json", "text/json", "text/plain"];
const MAX_IMG_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200 MB
const MAX_JSON_BYTES = 10 * 1024 * 1024; // 10 MB — eventresult JSONs are typically <1 MB

function pagePath(slug: string, seasonId: string, roundId: string): string {
  return `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/race-center`;
}

function publicRoundPath(slug: string, seasonId: string, roundId: string): string {
  return `/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;
}

function blobBasePath(leagueSlug: string, seasonId: string, roundNumber: number): string {
  return `race-center/${leagueSlug}/${seasonId}/${roundNumber}`;
}

/**
 * Resolve context — slug + season + round + round-number — and gate admin.
 * Used by every action below; centralised so we never authorise without
 * confirming the round actually exists under that league/season.
 */
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
    include: { season: { include: { league: true } }, raceCenter: { include: { charts: true } } },
  });
  if (!round || round.season.league.slug !== leagueSlug || round.seasonId !== seasonId) {
    throw new Error("Round not found in this league/season");
  }
  return { leagueSlug, seasonId, roundId, round };
}

/**
 * Save the Race Center narrative + curated cards + conditions + yellow flags.
 * Creates the row on first save; updates on subsequent saves. Does NOT
 * touch file-upload fields (replay, poster, charts) — those have their own
 * actions to keep validation focused per upload.
 */
export async function saveRaceCenter(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);

  const headline = strOrNull(formData.get("headline"));
  const highlightsMd = strOrNull(formData.get("highlightsMd"));
  const winnerNote = strOrNull(formData.get("winnerNote"));
  const fastestLapNote = strOrNull(formData.get("fastestLapNote"));
  const cleanestNote = strOrNull(formData.get("cleanestNote"));
  const comebackUserId = strOrNull(formData.get("comebackUserId"));
  const comebackNote = strOrNull(formData.get("comebackNote"));
  const replayCaption = strOrNull(formData.get("replayCaption"));
  const broadcastUrl = strOrNull(formData.get("broadcastUrl"));

  const airTempC = numOrNull(formData.get("airTempC"));
  const trackTempC = numOrNull(formData.get("trackTempC"));
  const skiesCode = intOrNull(formData.get("skiesCode"));
  const cloudCoverPct = numOrNull(formData.get("cloudCoverPct"));
  const precipMm = numOrNull(formData.get("precipMm"));
  const precipTimePct = numOrNull(formData.get("precipTimePct"));

  const yellowFlagCount = Math.max(0, intOrNull(formData.get("yellowFlagCount")) ?? 0);
  const yellowFlagNote = strOrNull(formData.get("yellowFlagNote"));

  const replayDurationS = intOrNull(formData.get("replayDurationS"));

  await prisma.raceCenter.upsert({
    where: { roundId },
    create: {
      roundId,
      headline,
      highlightsMd,
      winnerNote,
      fastestLapNote,
      cleanestNote,
      comebackUserId,
      comebackNote,
      airTempC,
      trackTempC,
      skiesCode,
      cloudCoverPct,
      precipMm,
      precipTimePct,
      yellowFlagCount,
      yellowFlagNote,
      replayCaption,
      replayDurationS,
      broadcastUrl,
    },
    update: {
      headline,
      highlightsMd,
      winnerNote,
      fastestLapNote,
      cleanestNote,
      comebackUserId,
      comebackNote,
      airTempC,
      trackTempC,
      skiesCode,
      cloudCoverPct,
      precipMm,
      precipTimePct,
      yellowFlagCount,
      yellowFlagNote,
      replayCaption,
      replayDurationS,
      broadcastUrl,
    },
  });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Saved");
}

/**
 * Upload (or replace) the 2D telemetry replay video and/or its poster.
 * Either field is optional; if both are empty the action redirects
 * with no-op feedback.
 */
export async function uploadRaceCenterReplay(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId, round } = await resolveContext(formData);

  const videoFile = formData.get("replay");
  const posterFile = formData.get("poster");

  let newReplayUrl: string | null | undefined = undefined;
  let newPosterUrl: string | null | undefined = undefined;

  const base = blobBasePath(leagueSlug, seasonId, round.roundNumber);

  if (videoFile instanceof File && videoFile.size > 0) {
    if (!ACCEPT_VIDEO.includes(videoFile.type)) {
      redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Replay+must+be+MP4%2FWebM%2FMOV");
    }
    if (videoFile.size > MAX_VIDEO_BYTES) {
      redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Replay+too+large+(max+200+MB)");
    }
    const ext = guessExt(videoFile.type, "mp4");
    if (round.raceCenter?.replayBlobUrl) {
      try {
        await del(round.raceCenter.replayBlobUrl);
      } catch {
        /* ignore — blob may already be gone */
      }
    }
    const blob = await put(`${base}/replay.${ext}`, videoFile, { access: "public" });
    newReplayUrl = blob.url;
  }

  if (posterFile instanceof File && posterFile.size > 0) {
    if (!ACCEPT_IMG.includes(posterFile.type)) {
      redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Poster+must+be+PNG%2FJPG%2FWebP");
    }
    if (posterFile.size > MAX_IMG_BYTES) {
      redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Poster+too+large+(max+20+MB)");
    }
    const ext = guessExt(posterFile.type, "jpg");
    if (round.raceCenter?.posterBlobUrl) {
      try {
        await del(round.raceCenter.posterBlobUrl);
      } catch {
        /* ignore */
      }
    }
    const blob = await put(`${base}/poster.${ext}`, posterFile, { access: "public" });
    newPosterUrl = blob.url;
  }

  if (newReplayUrl === undefined && newPosterUrl === undefined) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Nothing+to+upload");
  }

  await prisma.raceCenter.upsert({
    where: { roundId },
    create: {
      roundId,
      ...(newReplayUrl !== undefined ? { replayBlobUrl: newReplayUrl } : {}),
      ...(newPosterUrl !== undefined ? { posterBlobUrl: newPosterUrl } : {}),
    },
    update: {
      ...(newReplayUrl !== undefined ? { replayBlobUrl: newReplayUrl } : {}),
      ...(newPosterUrl !== undefined ? { posterBlobUrl: newPosterUrl } : {}),
    },
  });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Replay+uploaded");
}

/**
 * Upload (or replace) a single chart image. Each chart slot is identified by
 * `chartType`; uploading to a slot that already has an image replaces it
 * (with blob cleanup). Caption + sortOrder are also accepted.
 */
export async function uploadRaceCenterChart(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId, round } = await resolveContext(formData);

  const chartType = String(formData.get("chartType") ?? "").trim();
  if (!isValidChartType(chartType)) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Unknown+chart+type");
  }
  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=No+chart+image+provided");
  }
  if (!ACCEPT_IMG.includes((file as File).type)) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Chart+must+be+PNG%2FJPG%2FWebP");
  }
  if ((file as File).size > MAX_IMG_BYTES) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Chart+too+large+(max+20+MB)");
  }

  const title = strOrNull(formData.get("title")) ?? defaultTitleForChartType(chartType);
  const caption = strOrNull(formData.get("caption"));
  const sortOrder =
    intOrNull(formData.get("sortOrder")) ?? defaultSortOrderForChartType(chartType);

  // Ensure RaceCenter row exists.
  const raceCenter = await prisma.raceCenter.upsert({
    where: { roundId },
    create: { roundId },
    update: {},
    include: { charts: true },
  });

  const existing = raceCenter.charts.find((c) => c.chartType === chartType);
  const ext = guessExt((file as File).type, "png");
  const blobPath = `${blobBasePath(leagueSlug, seasonId, round.roundNumber)}/chart-${chartType}.${ext}`;

  if (existing?.blobUrl) {
    try {
      await del(existing.blobUrl);
    } catch {
      /* ignore */
    }
  }

  const blob = await put(blobPath, file as File, { access: "public" });

  await prisma.raceCenterChart.upsert({
    where: { raceCenterId_chartType: { raceCenterId: raceCenter.id, chartType } },
    create: {
      raceCenterId: raceCenter.id,
      chartType,
      title,
      blobUrl: blob.url,
      caption,
      sortOrder,
    },
    update: { title, blobUrl: blob.url, caption, sortOrder },
  });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + `?ok=Chart+${chartType}+uploaded`);
}

/**
 * Remove a single chart (cleans up its blob too).
 */
export async function deleteRaceCenterChart(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);
  const chartId = String(formData.get("chartId") ?? "");
  if (!chartId) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Missing+chartId");
  }
  const chart = await prisma.raceCenterChart.findUnique({ where: { id: chartId } });
  if (!chart) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Chart+not+found");
  }
  try {
    await del(chart!.blobUrl);
  } catch {
    /* ignore */
  }
  await prisma.raceCenterChart.delete({ where: { id: chartId } });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Chart+removed");
}

/**
 * Pull weather conditions from an uploaded iRacing eventresult JSON.
 * Parses the file in-memory, extracts the race-session weather_result block,
 * and writes the values onto the RaceCenter row. The JSON file is NOT stored.
 */
export async function pullWeatherFromIracingJson(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);

  const file = formData.get("iracingJson");
  if (!(file instanceof File) || file.size === 0) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=No+JSON+file+provided");
  }
  if ((file as File).size > MAX_JSON_BYTES) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=JSON+too+large+(max+10+MB)");
  }
  // tolerate plain-text/octet-stream too — file managers often mis-tag JSON.
  if ((file as File).type && !ACCEPT_JSON.includes((file as File).type) && (file as File).type !== "application/octet-stream") {
    // not fatal — just log and proceed; parse will fail safely if it's not JSON
  }

  let payload: unknown;
  try {
    const text = await (file as File).text();
    payload = JSON.parse(text);
  } catch {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=Could+not+parse+JSON");
  }

  const w = extractWeatherFromEventResult(payload);
  if (
    w.airTempC === null &&
    w.skiesCode === null &&
    w.cloudCoverPct === null &&
    w.precipMm === null &&
    w.precipTimePct === null
  ) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?error=No+weather+data+found+in+JSON");
  }

  await prisma.raceCenter.upsert({
    where: { roundId },
    create: {
      roundId,
      airTempC: w.airTempC,
      skiesCode: w.skiesCode,
      cloudCoverPct: w.cloudCoverPct,
      precipMm: w.precipMm,
      precipTimePct: w.precipTimePct,
    },
    update: {
      airTempC: w.airTempC,
      skiesCode: w.skiesCode,
      cloudCoverPct: w.cloudCoverPct,
      precipMm: w.precipMm,
      precipTimePct: w.precipTimePct,
    },
  });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  const sub = w.subsessionId ? `+(subsession+${w.subsessionId})` : "";
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Weather+pulled+from+JSON" + sub);
}

/**
 * Flip publishedAt → now. Makes the public Race Center tab visible.
 */
export async function publishRaceCenter(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);
  await prisma.raceCenter.upsert({
    where: { roundId },
    create: { roundId, publishedAt: new Date() },
    update: { publishedAt: new Date() },
  });
  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Published");
}

/**
 * Clear publishedAt → null. Hides the public tab; data stays in the DB.
 */
export async function unpublishRaceCenter(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);
  await prisma.raceCenter.update({
    where: { roundId },
    data: { publishedAt: null },
  });
  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Unpublished");
}

/**
 * Full delete — removes the RaceCenter row, all RaceCenterChart rows
 * (cascade), and best-effort cleans up every Vercel Blob asset.
 */
export async function deleteRaceCenter(formData: FormData): Promise<void> {
  const { leagueSlug, seasonId, roundId } = await resolveContext(formData);
  const existing = await prisma.raceCenter.findUnique({
    where: { roundId },
    include: { charts: true },
  });
  if (!existing) {
    redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Nothing+to+delete");
  }
  // Best-effort blob cleanup
  const urls: string[] = [];
  if (existing!.replayBlobUrl) urls.push(existing!.replayBlobUrl);
  if (existing!.posterBlobUrl) urls.push(existing!.posterBlobUrl);
  for (const c of existing!.charts) urls.push(c.blobUrl);
  for (const u of urls) {
    try {
      await del(u);
    } catch {
      /* ignore */
    }
  }
  await prisma.raceCenter.delete({ where: { id: existing!.id } });

  revalidatePath(publicRoundPath(leagueSlug, seasonId, roundId));
  redirect(pagePath(leagueSlug, seasonId, roundId) + "?ok=Race+Center+deleted");
}

// ---------------------------------------------------------------------------
// helpers

function strOrNull(v: FormDataEntryValue | null): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

function numOrNull(v: FormDataEntryValue | null): number | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (s.length === 0) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function intOrNull(v: FormDataEntryValue | null): number | null {
  const n = numOrNull(v);
  if (n === null) return null;
  return Math.trunc(n);
}

function guessExt(mimeType: string, fallback: string): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "video/mp4":
      return "mp4";
    case "video/webm":
      return "webm";
    case "video/quicktime":
      return "mov";
    default:
      return fallback;
  }
}
