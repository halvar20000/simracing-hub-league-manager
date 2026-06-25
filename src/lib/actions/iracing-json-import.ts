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

// CAR-MATCH ENFORCEMENT — leagues where a driver MUST race the exact car they
// registered. If the car driven in the imported JSON differs from the
// registered car, the result is disqualified (finishStatus = DSQ). Compared by
// iRacing car_id (registered car's iracingCarId vs the driven car_id), NOT by
// internal Car-row id — the latter produced false DSQs when iRacing renamed a
// car and resolveCarId minted a fresh row for the same physical car. Only flags
// when the registered car has a known iRacing id that differs from the driven
// one. See CLAUDE.md "Wrong-car DSQ".
const CAR_ENFORCED_LEAGUE_SLUGS = new Set(["cas-iec", "cas-gt3-wct"]);

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

interface DqDriver {
  displayName: string;
  drovenCar: string;
  registeredCar: string;
}

function buildSummaryQuery(
  imported: number,
  races: number,
  unmatched: UnmatchedDriver[],
  dq: DqDriver[]
): string {
  const params = new URLSearchParams({
    imported: String(imported),
    races: String(races),
    unmatchedCount: String(unmatched.length),
    dqCount: String(dq.length),
  });
  // Pack the first 12 unmatched as "custId:name|custId:name" to keep URL short.
  if (unmatched.length > 0) {
    const list = unmatched
      .slice(0, 12)
      .map((u) => `${u.custId}:${u.displayName.replace(/[|:]/g, " ")}`)
      .join("|");
    params.set("unmatched", list);
  }
  // Pack the first 12 DQs as "name~drove~registered|..." (~ separates fields,
  // | separates rows). Strip the separators from the values first.
  if (dq.length > 0) {
    const clean = (s: string) => s.replace(/[|~]/g, " ");
    const list = dq
      .slice(0, 12)
      .map((d) => `${clean(d.displayName)}~${clean(d.drovenCar)}~${clean(d.registeredCar)}`)
      .join("|");
    params.set("dq", list);
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

  // Does this league enforce that drivers race the car they registered?
  const carEnforced = CAR_ENFORCED_LEAGUE_SLUGS.has(leagueSlug);

  // Minimum race distance (%) needed to be classified. Drives the disconnect
  // rule below: a disconnect at/above this counts as DNF (driver completed
  // enough to be scored), below it counts as DSQ (treated as a forfeit).
  const seasonScoring = await prisma.season.findUnique({
    where: { id: seasonId },
    select: { scoringSystem: { select: { racePointsMinDistancePct: true } } },
  });
  const racePointsMinPct =
    seasonScoring?.scoringSystem?.racePointsMinDistancePct ?? 50;

  // Pull season roster + build cust_id → registrationId map
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      car: { select: { id: true, name: true, iracingCarId: true } },
    },
  });
  const memberMap = new Map<
    number,
    {
      regId: string;
      userId: string;
      currentCountry: string | null;
      currentCarId: string | null;
      currentStartNumber: string | null;
      /** Car the driver registered with — the source of truth for enforcement. */
      registeredCarId: string | null;
      registeredCarName: string | null;
      /** iRacing car_id of the registered car (null on legacy/unlinked rows). */
      registeredCarIracingId: number | null;
    }
  >();
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
      registeredCarId: reg.carId,
      registeredCarName: reg.car?.name ?? null,
      registeredCarIracingId: reg.car?.iracingCarId ?? null,
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
  const dqDrivers: DqDriver[] = [];
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
      // Stored as text (leading zeros preserved, e.g. "05").
      const carNumStr = (d as { carNumber?: string | null }).carNumber;
      if (carNumStr) {
        const num = carNumStr.trim();
        if (/^\d{1,4}$/.test(num) && num !== reg.currentStartNumber) {
          await prisma.registration.update({
            where: { id: reg.regId },
            data: { startNumber: num },
          });
          reg.currentStartNumber = num;
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

      // CAR-MATCH ENFORCEMENT (IEC + GT3 WCT): the driver must race the exact
      // car they registered. A deviation disqualifies the result. We compare by
      // iRacing car_id — NOT internal Car-row id — because resolveCarId may
      // create a fresh Car row when iRacing's car name has drifted (e.g. "BMW
      // M4 GT3 EVO", "Mercedes-AMG GT3 2020"), which would make the same
      // physical car resolve to a different row and trigger a false DSQ.
      // We only flag when we can PROVE a mismatch: the registered car has a
      // known iRacing id AND the driven car_id is known AND they differ. If the
      // registered car has no iRacing id (legacy/unlinked row), we cannot prove
      // anything, so we do not disqualify.
      const drivenCarIracingId = d.carIracingId ?? null;
      const carMismatch =
        carEnforced &&
        reg.registeredCarIracingId != null &&
        !!drivenCarIracingId &&
        drivenCarIracingId !== reg.registeredCarIracingId;

      // Result status. A wrong-car DSQ (car-enforced leagues) takes precedence.
      // Disconnect rule (all leagues): a disconnect is recorded as DNF when the
      // driver completed at least the minimum race distance to be classified,
      // otherwise DSQ (forfeit — no clean-race credit). iRacing reports a drop
      // as reason_out = "Disconnected"; the parser maps that to DSQ by default,
      // so we re-decide here using the actual distance.
      let finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ" = carMismatch
        ? "DSQ"
        : d.finishStatus;
      let dqNote: string | null = carMismatch
        ? `Auto-DQ: drove "${d.carName ?? "unknown car"}" but registered "${reg.registeredCarName ?? "unknown car"}"`
        : null;
      if (!carMismatch && /disconnect/i.test(d.reasonOut)) {
        if (distancePct >= racePointsMinPct) {
          finishStatus = "DNF";
          dqNote = `Disconnect at ${distancePct}% distance — classified as DNF (≥ ${racePointsMinPct}% minimum)`;
        } else {
          finishStatus = "DSQ";
          dqNote = `Disconnect at ${distancePct}% distance — DSQ (below ${racePointsMinPct}% minimum)`;
        }
      }

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
          finishStatus,
          carId: resolvedCarId,
          notes: dqNote,
        },
      });

      if (carMismatch) {
        dqDrivers.push({
          displayName: d.displayName,
          drovenCar: d.carName ?? "unknown car",
          registeredCar: reg.registeredCarName ?? "unknown car",
        });
      }

      // Keep the registration's "current car" in sync with the latest result —
      // but NOT for car-enforced leagues, where the registered car is the fixed
      // source of truth (otherwise a deviation could never be detected).
      if (!carEnforced && resolvedCarId && resolvedCarId !== reg.currentCarId) {
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
      unmatched,
      dqDrivers
    )}`
  );
}
