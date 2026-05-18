"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";

function readIntOrNull(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function readCategoryPointsFromForm(formData: FormData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lv of [0, 1, 2, 3]) {
    const v = formData.get(`categoryPoints_${lv}`);
    const n = v == null || String(v).trim() === "" ? 0 : parseInt(String(v), 10);
    out[String(lv)] = Number.isFinite(n) && n >= 0 ? n : 0;
  }
  return out;
}

function readPointsTable(
  formData: FormData,
  prefix: string,
  maxPos: number
): Record<string, number> {
  const out: Record<string, number> = {};
  for (let i = 1; i <= maxPos; i++) {
    const v = formData.get(`${prefix}_${i}`);
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    const n = parseInt(s, 10);
    if (Number.isFinite(n)) out[String(i)] = n;
  }
  return out;
}

/**
 * Create a new ScoringSystem. The admin supplies a name and may
 * optionally pick a source system to copy from — in that case every
 * field except `name` and `id` is duplicated from the source, so the
 * admin lands on the edit page with a working starting point that
 * they can refine.
 *
 * If no `copyFromId` is supplied, the new system is created with
 * sensible empty / default values so it's editable but doesn't award
 * points anywhere until configured.
 *
 * On success: redirects to the edit page for the newly-created
 * system. On error (missing name, name collision, source not found):
 * redirects back to /new with an error query param.
 */
export async function createScoringSystem(formData: FormData): Promise<void> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const copyFromId = String(formData.get("copyFromId") ?? "").trim() || null;

  if (!name) {
    redirect("/admin/scoring-systems/new?error=Name+is+required");
  }

  // Name collisions on the @unique field would throw P2002 — pre-check
  // so we can give a friendlier message instead of a Prisma stack.
  const existing = await prisma.scoringSystem.findUnique({
    where: { name },
    select: { id: true },
  });
  if (existing) {
    redirect(
      `/admin/scoring-systems/new?error=${encodeURIComponent(
        `A scoring system named "${name}" already exists`
      )}`
    );
  }

  let createdId: string;
  if (copyFromId) {
    const src = await prisma.scoringSystem.findUnique({
      where: { id: copyFromId },
    });
    if (!src) {
      redirect(
        "/admin/scoring-systems/new?error=" +
          encodeURIComponent("Source scoring system not found")
      );
    }
    // Prisma's findUnique returns JsonValue (which includes null) for
    // each Json column, but create() expects InputJsonValue | DbNull
    // for nullable Json fields. Map nulls through Prisma.DbNull and
    // cast non-null values through InputJsonValue so TS is happy.
    const j = (v: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.DbNull =>
      v === null ? Prisma.DbNull : (v as Prisma.InputJsonValue);
    const copied = await prisma.scoringSystem.create({
      data: {
        name,
        description: src.description,
        pointsTable: src.pointsTable as Prisma.InputJsonValue,
        classPointsTable: j(src.classPointsTable),
        participationPoints: src.participationPoints,
        participationMinDistancePct: src.participationMinDistancePct,
        racePointsMinDistancePct: src.racePointsMinDistancePct,
        bonusFastestLap: src.bonusFastestLap,
        bonusPole: src.bonusPole,
        bonusMostLapsLed: src.bonusMostLapsLed,
        dropWorstNRounds: src.dropWorstNRounds,
        fprEnabled: src.fprEnabled,
        fprTiers: j(src.fprTiers),
        fprMode: src.fprMode,
        participationInCombined: src.participationInCombined,
        racesPerRound: src.racesPerRound,
        pointsTableRace2: j(src.pointsTableRace2),
        protestWindowHours: src.protestWindowHours,
        protestCooldownHours: src.protestCooldownHours,
        deferPenaltyPoints: src.deferPenaltyPoints,
        categoryPointsTable: j(src.categoryPointsTable),
        driverFprEnabled: src.driverFprEnabled,
        driverFprTiers: j(src.driverFprTiers),
        driverFprMinDistancePct: src.driverFprMinDistancePct,
      },
    });
    createdId = copied.id;
  } else {
    const blank = await prisma.scoringSystem.create({
      data: {
        name,
        // Minimum required fields. Everything else takes its schema
        // default (participationPoints=0, racesPerRound=1, etc.).
        pointsTable: {},
      },
    });
    createdId = blank.id;
  }

  revalidatePath("/admin/scoring-systems");
  redirect(`/admin/scoring-systems/${createdId}/edit`);
}

export async function updateScoringSystem(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const description = String(formData.get("description") ?? "").trim() || null;

  const participationPoints =
    readIntOrNull(formData.get("participationPoints")) ?? 0;
  const participationMinDistancePct =
    readIntOrNull(formData.get("participationMinDistancePct")) ?? 75;
  const racePointsMinDistancePct =
    readIntOrNull(formData.get("racePointsMinDistancePct")) ?? 50;
  const bonusFastestLap = readIntOrNull(formData.get("bonusFastestLap"));
  const bonusPole = readIntOrNull(formData.get("bonusPole"));
  const bonusMostLapsLed = readIntOrNull(formData.get("bonusMostLapsLed"));
  const dropWorstNRounds = readIntOrNull(formData.get("dropWorstNRounds"));
  const categoryPointsTable = readCategoryPointsFromForm(formData);
  const driverFprEnabled = formData.get("driverFprEnabled") === "on";
  const driverFprMinDistancePct =
    readIntOrNull(formData.get("driverFprMinDistancePct")) ?? 90;
  const driverFprTiers: { maxInc: number; points: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const m = readIntOrNull(formData.get(`fprTier${i}MaxInc`));
    const pt = readIntOrNull(formData.get(`fprTier${i}Points`));
    if (m != null && pt != null) driverFprTiers.push({ maxInc: m, points: pt });
  }
  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));
  const protestCooldownHours = readIntOrNull(formData.get("protestCooldownHours"));
  const participationInCombined = formData.get("participationInCombined") === "on";
  const deferPenaltyPoints = formData.get("deferPenaltyPoints") === "on";

  const pointsTable = readPointsTable(formData, "pos", 40);
  const pointsTableRace2Raw = readPointsTable(formData, "posR2", 40);
  const pointsTableRace2 =
    Object.keys(pointsTableRace2Raw).length > 0 ? pointsTableRace2Raw : null;
  const racesPerRoundRaw = formData.get("racesPerRound");
  const racesPerRound =
    racesPerRoundRaw == null || String(racesPerRoundRaw).trim() === ""
      ? 1
      : Math.max(1, Math.min(4, parseInt(String(racesPerRoundRaw), 10) || 1));
  const classPointsTableObj = readPointsTable(formData, "classPos", 40);
  const classPointsTable =
    Object.keys(classPointsTableObj).length > 0 ? classPointsTableObj : null;

  await prisma.scoringSystem.update({
    where: { id },
    data: {
      description,
      pointsTable,
      classPointsTable:
        classPointsTable === null
          ? Prisma.DbNull
          : classPointsTable,
      participationPoints,
      participationMinDistancePct,
      racePointsMinDistancePct,
      bonusFastestLap,
      bonusPole,
      bonusMostLapsLed,
      dropWorstNRounds,
      protestWindowHours,
      protestCooldownHours,
      participationInCombined,
      deferPenaltyPoints,
      categoryPointsTable,
      driverFprEnabled,
      driverFprMinDistancePct,
      driverFprTiers: driverFprTiers.length > 0 ? driverFprTiers : Prisma.DbNull,
      racesPerRound,
      pointsTableRace2:
        pointsTableRace2 === null ? Prisma.DbNull : pointsTableRace2,
    },
  });

  // Recompute scoring on every round of every season that uses this system.
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: id },
    select: { id: true },
  });
  if (seasons.length > 0) {
    const seasonIds = seasons.map((s) => s.id);
    const rounds = await prisma.round.findMany({
      where: { seasonId: { in: seasonIds }, raceResults: { some: {} } },
      select: { id: true },
    });
    for (const r of rounds) {
      await recomputeRoundScoring(prisma, r.id);
    }
  }

  revalidatePath("/admin/scoring-systems");
  revalidatePath(`/admin/scoring-systems/${id}/edit`);
  redirect("/admin/scoring-systems?saved=1");
}
