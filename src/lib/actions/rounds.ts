"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";
import { applyNoRsvpNoShowPenalties } from "@/lib/no-rsvp-penalty";
import { postRoundResults } from "@/lib/notify-results";
import type { RoundStatus } from "@prisma/client";

export async function createRound(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;

  if (!name || !track || !startsAtRaw) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/new?error=Name%2C+track+and+start+time+are+required`
    );
  }

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  // Auto-assign next round number
  const lastRound = await prisma.round.findFirst({
    where: { seasonId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true },
  });
  const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

  await prisma.round.create({
    data: {
      seasonId,
      roundNumber,
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function updateRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;
  const status = String(formData.get("status") ?? "UPCOMING") as RoundStatus;
  const irlmEventIdRaw = String(formData.get("irlmEventId") ?? "").trim();
  const irlmEventId = irlmEventIdRaw ? parseInt(irlmEventIdRaw, 10) : null;

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  await prisma.round.update({
    where: { id: roundId },
    data: {
      irlmEventId,
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
      status,
    },
  });

  // No-RSVP no-show penalties (GT3 WCT only). Runs before the pool recompute
  // so the new penalties feed into the auto-forgiveness calculation. The
  // helper is safe to call on any status transition — it clears stale auto
  // penalties when a round is moved out of COMPLETED.
  await applyNoRsvpNoShowPenalties(roundId);

  // Penalty pool: recompute auto-forgiveness when a round is marked complete
  if (status === "COMPLETED") {
    await recomputePenaltyPoolForSeason(seasonId);
    // Post the results to Discord after the response is sent. Idempotent
    // (Round.resultsPostedAt) and a no-op when the league has no results
    // channel or the round has no results imported yet — so it naturally
    // retries on the next save until both are true.
    after(async () => {
      try {
        await postRoundResults(roundId);
      } catch {
        /* never block a round save on a Discord hiccup */
      }
    });
  }

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

/**
 * Publish / unpublish a round's results without going through the full
 * Edit-round form. Publishing flips status to COMPLETED (which makes results
 * and standings public) and runs the exact same downstream pipeline as
 * updateRound: no-show penalties, penalty-pool recompute, Discord results
 * post. Unpublishing moves it back to IN_PROGRESS (results stay imported, but
 * become admin-preview-only again) and clears the COMPLETED-only side effects.
 *
 * Used as a `<form action>` on the admin round page — reads hidden inputs and
 * returns void (redirects on success).
 */
export async function setRoundPublished(formData: FormData) {
  await requireAdmin();

  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const publish = String(formData.get("publish") ?? "") === "1";

  const status: RoundStatus = publish ? "COMPLETED" : "IN_PROGRESS";

  await prisma.round.update({
    where: { id: roundId },
    data: { status },
  });

  // Same downstream pipeline as updateRound. applyNoRsvpNoShowPenalties is safe
  // on any transition — it clears stale auto penalties when leaving COMPLETED.
  await applyNoRsvpNoShowPenalties(roundId);

  if (status === "COMPLETED") {
    await recomputePenaltyPoolForSeason(seasonId);
    after(async () => {
      try {
        await postRoundResults(roundId);
      } catch {
        /* never block a round save on a Discord hiccup */
      }
    });
  }

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?${publish ? "published=1" : "unpublished=1"}`
  );
}

export async function deleteRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string
) {
  await requireAdmin();
  await prisma.round.delete({ where: { id: roundId } });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

// ---------- bulkCreateRounds ----------
//
// One textarea, one row per round. Fields can be separated by TAB
// (paste from Google Sheets / Excel — TSV), pipe (|), or comma.
// We auto-detect the separator per line, in that order of preference.
//
// Column order (4–6 columns):
//   1. Name           — string. If empty, defaults to "Round N — Track"
//   2. Track          — string, REQUIRED
//   3. Track config   — string, optional (may be empty)
//   4. Start datetime — REQUIRED. "YYYY-MM-DD HH:MM" (local server time)
//                       or any string Date() can parse (ISO 8601 etc.).
//   5. Race length    — integer minutes, optional
//   6. Counts?        — y/n / true/false / 1/0, optional (default true)
//
// Blank lines and lines starting with '#' are ignored.
// All rows are validated FIRST; on any error we redirect back with the
// errors and create nothing (atomic).
function parseTruthy(raw: string | undefined): boolean {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "") return true;
  return ["y", "yes", "true", "1", "x"].includes(v);
}
function splitRow(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((s) => s.trim());
  if (line.includes("|")) return line.split("|").map((s) => s.trim());
  // comma — but track names can contain commas, so require at least 4
  // commas before treating as CSV. Otherwise fall back to TAB only.
  if ((line.match(/,/g) ?? []).length >= 3) {
    return line.split(",").map((s) => s.trim());
  }
  return [line.trim()];
}

export async function bulkCreateRounds(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const raw = String(formData.get("rows") ?? "");
  const back = (msg: string) =>
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/bulk?error=${encodeURIComponent(
        msg
      )}`
    );

  if (!raw.trim()) back("Paste at least one row.");

  type ParsedRow = {
    line: number;
    name: string;
    track: string;
    trackConfig: string | null;
    startsAt: Date;
    raceLengthMinutes: number | null;
    countsForChampionship: boolean;
  };

  const rows: ParsedRow[] = [];
  const errors: string[] = [];

  const lines = raw.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const lineRaw = lines[i]!;
    const trimmed = lineRaw.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const cols = splitRow(trimmed);
    if (cols.length < 3) {
      errors.push(
        `Line ${i + 1}: need at least 3 columns (name, track, start datetime).`
      );
      continue;
    }

    const isHeader =
      i === 0 &&
      cols.slice(0, 3).some((c) => /name|track|date|start/i.test(c)) &&
      !/^\d{4}-\d{2}-\d{2}/.test(cols[3] ?? "");
    if (isHeader) continue;

    // Pad to 6 columns
    while (cols.length < 6) cols.push("");
    const [
      nameCol,
      trackCol,
      configCol,
      whenCol,
      lengthCol,
      countsCol,
    ] = cols;

    if (!trackCol) {
      errors.push(`Line ${i + 1}: track is required.`);
      continue;
    }
    if (!whenCol) {
      errors.push(`Line ${i + 1}: start datetime is required.`);
      continue;
    }
    // Accept "YYYY-MM-DD HH:MM" or ISO; Date() handles both.
    const startsAt = new Date(whenCol.replace(" ", "T"));
    if (Number.isNaN(startsAt.getTime())) {
      errors.push(
        `Line ${i + 1}: could not parse start datetime "${whenCol}". Try YYYY-MM-DD HH:MM.`
      );
      continue;
    }

    const raceLengthMinutes =
      lengthCol && /^\d+$/.test(lengthCol) ? parseInt(lengthCol, 10) : null;

    rows.push({
      line: i + 1,
      name: nameCol,
      track: trackCol,
      trackConfig: configCol || null,
      startsAt,
      raceLengthMinutes,
      countsForChampionship: parseTruthy(countsCol),
    });
  }

  if (errors.length > 0) {
    back(errors.slice(0, 6).join(" / "));
  }
  if (rows.length === 0) back("No valid rows found.");

  // Auto-assign roundNumber continuing from current highest.
  const last = await prisma.round.findFirst({
    where: { seasonId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true },
  });
  let next = (last?.roundNumber ?? 0) + 1;

  // Atomic: createMany inside a transaction so a mid-list failure rolls
  // everything back.
  await prisma.$transaction(
    rows.map((r) =>
      prisma.round.create({
        data: {
          seasonId,
          roundNumber: next++,
          name: r.name || `Round ${next - 1} — ${r.track}`,
          track: r.track,
          trackConfig: r.trackConfig,
          startsAt: r.startsAt,
          raceLengthMinutes: r.raceLengthMinutes,
          countsForChampionship: r.countsForChampionship,
        },
      })
    )
  );

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}
