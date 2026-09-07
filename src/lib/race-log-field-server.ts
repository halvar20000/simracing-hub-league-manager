import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  parseFieldLog,
  FIELD_MODEL_GENERATION,
  type FieldModel,
} from "@/lib/race-log-field";
import { matchRoundForLog } from "@/lib/race-logger";
import type { PlannerState } from "@/lib/stint-plan-state";

/**
 * The field parse for one uploaded race log — fetched, parsed and frozen once.
 *
 * Two rules make this worth a table instead of a helper:
 *
 *   • The raw log is megabytes (Sebring: 6.3 MB, a 24 h race far more). Parsing
 *     it on every page view is waste, and a page that sometimes times out is a
 *     page nobody trusts.
 *   • The key is the SESSION, not the plan. Everybody in that race logged the
 *     same subsession, so the second CAS team to open its de-briefing finds the
 *     field already parsed instead of uploading the identical file again. That
 *     is the whole point of hanging the log off the round rather than the plan.
 *
 * Best-effort by contract: every entry point returns null rather than throwing.
 * A de-briefing must still render when the blob store is having a bad day —
 * the field is a reference, not the subject.
 */

/** Largest log we will pull into memory. Beyond this the reference is not
 *  worth the RAM on a shared box. */
const MAX_BYTES = 64 * 1024 * 1024;

/** The blob store is fast; a slow answer means it is not coming. */
const FETCH_TIMEOUT_MS = 20_000;

export type FieldContext = {
  model: FieldModel;
  /** Our own car in that model, when the plan identified its number. */
  ownCarNumber: string | null;
  /** True when this row was parsed for a different plan of the same race. */
  shared: boolean;
  sourceKey: string;
};

const sha = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** "sid:321130192" for a real iRacing session, else the URL's own hash. */
function sourceKeyOf(url: string, sessionUniqueId: number | null): string {
  return sessionUniqueId != null && Number.isFinite(sessionUniqueId)
    ? `sid:${sessionUniqueId}`
    : `url:${sha(url).slice(0, 32)}`;
}

/**
 * Which round this session belongs to.
 *
 * Cheapest answer first: a logger upload of the SAME subsession that an admin
 * (or the auto-matcher) already filed against a round settles it without
 * guessing. Only when there is none do we fall back to the track+date matcher,
 * and only for a user whose registrations narrow it down.
 */
async function resolveRoundId(
  sessionUniqueId: number | null,
  meta: { track: string | null; startedAt: Date | null },
  userId: string | null
): Promise<string | null> {
  if (sessionUniqueId != null) {
    const hit = await prisma.raceLogUpload.findFirst({
      where: { sessionUniqueId, roundId: { not: null } },
      select: { roundId: true },
    });
    if (hit?.roundId) return hit.roundId;
  }
  if (!userId) return null;
  try {
    const r = await matchRoundForLog(userId, meta, meta.startedAt ?? new Date());
    return r?.id ?? null;
  } catch {
    return null;
  }
}

async function fetchLog(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (Number.isFinite(len) && len > MAX_BYTES) return null;
    const text = await res.text();
    return text.length > 0 ? text : null;
  } catch {
    return null;
  }
}

/**
 * The field model for one raw-log URL: from the cache, or parsed and stored.
 *
 * `planId` and `userId` only improve the bookkeeping (which plan produced the
 * row, which round it belongs to); the parse itself never depends on them, so
 * two plans of the same race cannot end up with different numbers.
 */
export async function fieldModelForUrl(
  url: string,
  opts?: { planId?: string | null; userId?: string | null }
): Promise<FieldContext | null> {
  if (!url || !/^https?:\/\//i.test(url)) return null;

  // A row already parsed from this exact file.
  const byUrl = await prisma.raceLogField.findFirst({
    where: { url, generation: FIELD_MODEL_GENERATION },
    select: { data: true, sourceKey: true, planId: true },
  });
  if (byUrl) {
    return {
      model: byUrl.data as unknown as FieldModel,
      ownCarNumber: null,
      shared: byUrl.planId != null && byUrl.planId !== (opts?.planId ?? null),
      sourceKey: byUrl.sourceKey,
    };
  }

  const text = await fetchLog(url);
  if (!text) return null;
  const parsed = parseFieldLog(text);
  if (!parsed.ok || !parsed.model) return null;
  const model = parsed.model;
  const sourceKey = sourceKeyOf(url, model.sessionUniqueId);

  // Somebody else's upload of the same subsession — reuse it verbatim rather
  // than storing a second parse of the same race under a different URL.
  const existing = await prisma.raceLogField.findUnique({
    where: { sourceKey },
    select: { data: true, generation: true, planId: true },
  });
  if (existing && existing.generation === FIELD_MODEL_GENERATION) {
    return {
      model: existing.data as unknown as FieldModel,
      ownCarNumber: null,
      shared: existing.planId != null && existing.planId !== (opts?.planId ?? null),
      sourceKey,
    };
  }

  const startedAt = (() => {
    if (!model.startedAt) return null;
    const d = new Date(model.startedAt);
    return Number.isNaN(d.getTime()) ? null : d;
  })();
  const roundId = await resolveRoundId(
    model.sessionUniqueId,
    { track: model.track, startedAt },
    opts?.userId ?? null
  );

  const row = {
    sessionUniqueId: model.sessionUniqueId,
    sessionNum: model.sessionNum,
    url,
    roundId,
    planId: opts?.planId ?? null,
    track: model.track,
    sessionName: model.sessionName,
    official: model.official,
    startedAt,
    generation: FIELD_MODEL_GENERATION,
    cars: model.cars.length,
    data: model as unknown as object,
  };
  try {
    await prisma.raceLogField.upsert({
      where: { sourceKey },
      create: { sourceKey, ...row },
      update: row,
    });
  } catch {
    // A cache that cannot be written is still a usable answer this once.
  }
  return { model, ownCarNumber: null, shared: false, sourceKey };
}

/** The field around one stint plan's race, or null when it has no log yet. */
export async function fieldForPlan(
  plan: { id: string; createdByUserId?: string | null },
  state: PlannerState
): Promise<FieldContext | null> {
  const url = state.raceLog?.url;
  if (!url) return null;
  const ctx = await fieldModelForUrl(url, {
    planId: plan.id,
    userId: plan.createdByUserId ?? null,
  });
  if (!ctx) return null;
  return { ...ctx, ownCarNumber: state.raceLog?.ownCarNumber ?? null };
}
