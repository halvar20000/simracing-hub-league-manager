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
// Auto-creates Car (and a default CarClass if the season has none).
// Tries to guess the right CarClass by matching keywords in the car's name
// against each CarClass's name (e.g. "Radical SR8" → CarClass "Radical SR 8").
function guessCarClassId(
  carName: string,
  classes: { id: string; name: string; displayOrder: number }[]
): string {
  const haystack = carName.toLowerCase();
  for (const c of classes) {
    const tokens = c.name.toLowerCase().split(/\W+/).filter((t) => t.length > 2);
    if (tokens.some((t) => haystack.includes(t))) return c.id;
  }
  // Fallback: first class by displayOrder.
  return classes[0].id;
}

async function resolveCarId(
  seasonId: string,
  iracingCarId: number,
  carName: string,
  carClassShortName: string | null
): Promise<string | null> {
  if (!iracingCarId || !Number.isFinite(iracingCarId)) return null;

  const existing = await prisma.car.findFirst({
    where: { seasonId, iracingCarId },
    select: { id: true },
  });
  if (existing) return existing.id;

  let classes = await prisma.carClass.findMany({
    where: { seasonId },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, displayOrder: true },
  });

  // No classes at all → auto-create one from the iRacing class name.
  if (classes.length === 0) {
    const shortCode = (carClassShortName ?? "ALL").slice(0, 8).toUpperCase();
    const created = await prisma.carClass.create({
      data: {
        seasonId,
        name: carClassShortName ?? "All Cars",
        shortCode,
      },
    });
    classes = [{ id: created.id, name: created.name, displayOrder: created.displayOrder }];
  }

  const carClassId = guessCarClassId(carName || "", classes);

  const created = await prisma.car.create({
    data: {
      seasonId,
      carClassId,
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
  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null; currentCarId: string | null }>();
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
