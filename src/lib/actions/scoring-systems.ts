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
  const protestWindowHours = readIntOrNull(formData.get("protestWindowHours"));
  const protestCooldownHours = readIntOrNull(formData.get("protestCooldownHours"));
  const participationInCombined = formData.get("participationInCombined") === "on";
  const deferPenaltyPoints = formData.get("deferPenaltyPoints") === "on";

  const pointsTable = readPointsTable(formData, "pos", 30);
  const pointsTableRace2Raw = readPointsTable(formData, "posR2", 30);
  const pointsTableRace2 =
    Object.keys(pointsTableRace2Raw).length > 0 ? pointsTableRace2Raw : null;
  const racesPerRoundRaw = formData.get("racesPerRound");
  const racesPerRound =
    racesPerRoundRaw == null || String(racesPerRoundRaw).trim() === ""
      ? 1
      : Math.max(1, Math.min(4, parseInt(String(racesPerRoundRaw), 10) || 1));
  const classPointsTableObj = readPointsTable(formData, "classPos", 30);
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
