/**
 * Pro/Am introduction races ("Einführungsrennen", GT3 WCT, rule agreed
 * 2026-11-09).
 *
 * A driver without a Pro/Am class who races in a Pro/Am season is a guest:
 * he stays in the race result with his overall position, but scores NOTHING
 * (no race, class, participation or team points) and takes no class
 * position from anyone. Once an admin classifies him, the class counts from
 * the NEXT race on: the rounds he already raced stay guest rounds.
 *
 * Why the rounds are remembered: class positions are recomputed from the
 * CURRENT class on every page view. Without this list, classifying a driver
 * would re-rank the intro race and take points off everybody behind him in
 * an already published result.
 *
 * Storage: `AppSetting` `proam-guest:<seasonId>` = { registrationId: roundId[] }
 * (no schema change). Written by `noteGuestRoundsOnRating` from every action
 * that sets `Registration.proAmClass`.
 *
 * Callers neutralise guest results IN MEMORY right after loading them
 * (`neutraliseGuestResult`), so the scoring code after that needs no change.
 *
 * Not a "use server" module.
 */
import type { PrismaClient } from "@prisma/client";

const KEY_PREFIX = "proam-guest:";
const keyOf = (seasonId: string) => `${KEY_PREFIX}${seasonId}`;

/**
 * A round counts as an intro race only if most of the rest of its field
 * already had a class. Classifying the whole grid after round 1 (season
 * start) must not turn round 1 into a guest round for everybody.
 */
export const MIN_RATED_FIELD_SHARE = 0.5;

export type GuestRounds = Record<string, string[]>;

export function parseGuestRounds(value: string | null | undefined): GuestRounds {
  if (!value) return {};
  try {
    const raw = JSON.parse(value) as unknown;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: GuestRounds = {};
    for (const [regId, rounds] of Object.entries(raw as Record<string, unknown>)) {
      if (Array.isArray(rounds)) {
        const ids = rounds.filter((x): x is string => typeof x === "string");
        if (ids.length) out[regId] = ids;
      }
    }
    return out;
  } catch {
    return {};
  }
}

export type GuestLookup = {
  /** True when this result scores nothing (see the module comment). */
  isGuest(registrationId: string, proAmClass: string | null, roundId: string): boolean;
  /** Recorded intro rounds of one registration (empty for unclassified drivers). */
  roundsOf(registrationId: string): string[];
};

export function makeGuestLookup(proAmEnabled: boolean, rounds: GuestRounds): GuestLookup {
  const sets = new Map(Object.entries(rounds).map(([k, v]) => [k, new Set(v)]));
  return {
    isGuest(registrationId, proAmClass, roundId) {
      if (!proAmEnabled) return false;
      if (proAmClass !== "PRO" && proAmClass !== "AM") return true;
      return sets.get(registrationId)?.has(roundId) ?? false;
    },
    roundsOf(registrationId) {
      return rounds[registrationId] ?? [];
    },
  };
}

type PrismaLike = Pick<PrismaClient, "appSetting">;

export async function loadGuestRounds(prisma: PrismaLike, seasonId: string): Promise<GuestRounds> {
  const row = await prisma.appSetting.findUnique({ where: { key: keyOf(seasonId) } });
  return parseGuestRounds(row?.value);
}

export async function loadGuestLookup(
  prisma: PrismaLike,
  seasonId: string,
  proAmEnabled: boolean
): Promise<GuestLookup> {
  if (!proAmEnabled) return makeGuestLookup(false, {});
  return makeGuestLookup(true, await loadGuestRounds(prisma, seasonId));
}

/**
 * Zero the points of a guest result in place. Penalties and corrections stay:
 * a steward decision from an intro race still applies.
 */
export function neutraliseGuestResult(r: {
  rawPointsAwarded: number;
  participationPointsAwarded: number;
}): void {
  r.rawPointsAwarded = 0;
  r.participationPointsAwarded = 0;
}

async function saveGuestRounds(prisma: PrismaLike, seasonId: string, rounds: GuestRounds) {
  const key = keyOf(seasonId);
  if (Object.keys(rounds).length === 0) {
    await prisma.appSetting.deleteMany({ where: { key } });
    return;
  }
  const value = JSON.stringify(rounds);
  await prisma.appSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
}

/**
 * Call after `Registration.proAmClass` was written. On unclassified ->
 * PRO/AM, every round this driver already has a result in becomes an intro
 * round (if the rest of that field was mostly classified). Any other change
 * leaves the list alone.
 */
export async function noteGuestRoundsOnRating(
  prisma: PrismaClient,
  registrationId: string,
  oldClass: string | null,
  newClass: string | null
): Promise<void> {
  const wasRated = oldClass === "PRO" || oldClass === "AM";
  const isRated = newClass === "PRO" || newClass === "AM";
  if (wasRated || !isRated) return;

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    select: { seasonId: true, season: { select: { proAmEnabled: true } } },
  });
  if (!reg?.season.proAmEnabled) return;

  const ownRounds = await prisma.raceResult.findMany({
    where: { registrationId },
    select: { roundId: true },
    distinct: ["roundId"],
  });
  if (ownRounds.length === 0) return;

  const fields = await prisma.raceResult.findMany({
    where: {
      roundId: { in: ownRounds.map((r) => r.roundId) },
      registrationId: { not: registrationId },
    },
    select: { roundId: true, registrationId: true, registration: { select: { proAmClass: true } } },
  });
  const guestRoundIds: string[] = [];
  for (const { roundId } of ownRounds) {
    const others = new Map<string, string | null>();
    for (const f of fields) {
      if (f.roundId === roundId) others.set(f.registrationId, f.registration.proAmClass);
    }
    const rated = [...others.values()].filter((c) => c === "PRO" || c === "AM").length;
    if (others.size > 0 && rated / others.size >= MIN_RATED_FIELD_SHARE) {
      guestRoundIds.push(roundId);
    }
  }
  if (guestRoundIds.length === 0) return;

  const rounds = await loadGuestRounds(prisma, reg.seasonId);
  rounds[registrationId] = [...new Set([...(rounds[registrationId] ?? []), ...guestRoundIds])];
  await saveGuestRounds(prisma, reg.seasonId, rounds);
}

/** Admin undo: the driver's intro races count normally (in his class) again. */
export async function clearGuestRounds(
  prisma: PrismaClient,
  seasonId: string,
  registrationId: string
): Promise<void> {
  const rounds = await loadGuestRounds(prisma, seasonId);
  if (!(registrationId in rounds)) return;
  delete rounds[registrationId];
  await saveGuestRounds(prisma, seasonId, rounds);
}
