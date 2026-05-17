"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import {
  parseIracingEventJson,
  IracingJsonParseError,
  type ParsedEvent,
} from "@/lib/iracing-json";

// CAR LOOKUP — resolve a season's Car for an iRacing car_id.
// Auto-creates a season-wide Car (carClassId NULL) when nothing matches.

async function resolveCarId(
  seasonId: string,
  iracingCarId: number,
  carName: string,
  carClassShortName: string | null
): Promise<string | null> {
  if (!iracingCarId || !Number.isFinite(iracingCarId)) return null;

  // 1. Exact match by (seasonId, iracingCarId).
  const existing = await prisma.car.findFirst({
    where: { seasonId, iracingCarId },
    select: { id: true },
  });
  if (existing) return existing.id;

  // 2. Match by name within this season — covers cars pre-created via the
  //    "Copy from previous season" button (which doesn't carry iracingCarId).
  //    Backfill the iRacing id so future imports go through path (1).
  if (carName) {
    const byName = await prisma.car.findFirst({
      where: { seasonId, name: carName },
      select: { id: true, iracingCarId: true },
    });
    if (byName) {
      if (byName.iracingCarId !== iracingCarId) {
        try {
          await prisma.car.update({
            where: { id: byName.id },
            data: { iracingCarId },
          });
        } catch {
          /* ignore — another row may already have this iRacing id */
        }
      }
      return byName.id;
    }
  }

  // Default new cars created by the importer to season-wide (carClassId
  // NULL) so they're selectable from every driver class. Admins can later
  // pin them to a specific class via Manage Cars if they need to.
  const created = await prisma.car.create({
    data: {
      seasonId,
      carClassId: null,
      name: carName || `iRacing #${iracingCarId}`,
      iracingCarId,
    },
  });
  return created.id;
}


interface UnmatchedDriver {
  custId: number;
  displayName: string;
}

function buildSummaryQuery(
  imported: number,
  races: number,
  unmatched: UnmatchedDriver[]
): string {
  const params = new URLSearchParams({
    imported: String(imported),
    races: String(races),
    unmatchedCount: String(unmatched.length),
  });
  // Pack the first 12 unmatched as "custId:name|custId:name" to keep URL short.
  if (unmatched.length > 0) {
    const list = unmatched
      .slice(0, 12)
      .map((u) => `${u.custId}:${u.displayName.replace(/[|:]/g, " ")}`)
      .join("|");
    params.set("unmatched", list);
  }
  return params.toString();
}

export async function importIracingJson(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const file = formData.get("jsonFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?error=No+file+selected`
    );
  }

  const text = await (file as File).text();

  let parsed: ParsedEvent;
  try {
    parsed = parseIracingEventJson(JSON.parse(text));
  } catch (e) {
    const msg =
      e instanceof IracingJsonParseError
        ? e.message
        : e instanceof SyntaxError
          ? "File is not valid JSON"
          : "Could not parse iRacing JSON";
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?error=${encodeURIComponent(
        msg
      )}`
    );
  }

  // Pull season roster + build cust_id → registrationId map
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: { user: true },
  });
  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentCarId: string | null; currentStartNumber: number | null }>();
  for (const reg of registrations) {
    const raw = reg.user.iracingMemberId;
    if (!raw) continue;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) continue;
    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
      currentCarId: reg.carId,
      currentStartNumber: reg.startNumber,
    });
  }

  // REPLACE policy: wipe existing race results for this round
  await prisma.raceResult.deleteMany({ where: { roundId } });

  // Build qualifying lookup (cust_id → fastest lap in qualify in ms)
  const qualSession = parsed.sessions.find((s) => s.kind === "QUALIFY");
  const qualByCustId = new Map<number, number | null>();
  if (qualSession) {
    for (const d of qualSession.drivers) {
      const ms = d.bestLapMs ?? d.qualLapMs ?? null;
      qualByCustId.set(d.custId, ms);
    }
  }

  const unmatchedSet = new Map<number, UnmatchedDriver>();
  let totalCreated = 0;
  const raceSessions = parsed.sessions.filter((s) => s.kind === "RACE");

  for (const session of raceSessions) {
    for (const d of session.drivers) {
      const reg = memberMap.get(d.custId);
      if (!reg) {
        if (!unmatchedSet.has(d.custId)) {
          unmatchedSet.set(d.custId, {
            custId: d.custId,
            displayName: d.displayName,
          });
        }
        continue;
      }

      // Update country code on user if differs and we have one
      if (d.countryCode && d.countryCode !== reg.currentCountry) {
        await prisma.user.update({
          where: { id: reg.userId },
          data: { countryCode: d.countryCode },
        });
        reg.currentCountry = d.countryCode;
      }

      // Update startNumber from livery.car_number when present + numeric.
      const carNumStr = (d as { carNumber?: string | null }).carNumber;
      if (carNumStr) {
        const n = parseInt(carNumStr, 10);
        if (Number.isFinite(n) && n !== reg.currentStartNumber) {
          await prisma.registration.update({
            where: { id: reg.regId },
            data: { startNumber: n },
          });
          reg.currentStartNumber = n;
        }
      }

      const distancePct =
        session.maxLaps > 0
          ? Math.min(100, Math.floor((d.lapsComplete / session.maxLaps) * 100))
          : 0;

      const resolvedCarId = await resolveCarId(
        seasonId,
        d.carIracingId ?? 0,
        d.carName ?? "",
        d.carClassShortName
      );

      await prisma.raceResult.create({
        data: {
          roundId,
          registrationId: reg.regId,
          raceNumber: session.raceNumber,
          finishPosition: d.finishPosition,
          startPosition: d.startingPosition,
          lapsCompleted: d.lapsComplete,
          raceDistancePct: distancePct,
          bestLapTimeMs: d.bestLapMs,
          qualifyingTimeMs: qualByCustId.get(d.custId) ?? null,
          iRating: d.iRating,
          incidents: d.incidents,
          finishStatus: d.finishStatus,
          carId: resolvedCarId,
        },
      });

      // Keep the registration's "current car" in sync with latest result.
      if (resolvedCarId && resolvedCarId !== reg.currentCarId) {
        await prisma.registration.update({
          where: { id: reg.regId },
          data: { carId: resolvedCarId },
        });
        reg.currentCarId = resolvedCarId;
      }
      totalCreated++;
    }
  }

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);

  const unmatched = Array.from(unmatchedSet.values());
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?${buildSummaryQuery(
      totalCreated,
      raceSessions.length,
      unmatched
    )}`
  );
}
