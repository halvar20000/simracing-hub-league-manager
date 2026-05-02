"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

function parseLine(raw: string): { name: string; iracingCarId: number | null } | null {
  const line = raw.trim();
  if (!line) return null;
  const lastComma = line.lastIndexOf(",");
  if (lastComma > -1) {
    const possible = line.slice(lastComma + 1).trim();
    if (/^\d+$/.test(possible)) {
      const name = line.slice(0, lastComma).trim();
      if (!name) return null;
      return { name, iracingCarId: parseInt(possible, 10) };
    }
  }
  return { name: line, iracingCarId: null };
}

export async function addCarsBulk(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");

  const lines = String(formData.get("lines") ?? "").split(/\r?\n/);

  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      _count: { select: { cars: true } },
      season: { include: { league: true } },
    },
  });
  if (!cc) throw new Error("CarClass not found");

  let order = cc._count.cars;
  for (const raw of lines) {
    const parsed = parseLine(raw);
    if (!parsed) continue;
    await prisma.car.upsert({
      where: { carClassId_name: { carClassId, name: parsed.name } },
      update: { iracingCarId: parsed.iracingCarId },
      create: {
        seasonId: cc.seasonId,
        carClassId,
        name: parsed.name,
        iracingCarId: parsed.iracingCarId,
        displayOrder: order,
      },
    });
    order++;
  }

  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}

export async function deleteCar(formData: FormData) {
  await requireAdmin();
  const carId = String(formData.get("carId") ?? "");
  if (!carId) throw new Error("carId required");

  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      carClass: {
        include: { season: { include: { league: true } } },
      },
    },
  });
  if (!car) return;

  await prisma.car.delete({ where: { id: carId } });

  revalidatePath(
    `/admin/leagues/${car.carClass.season.league.slug}/seasons/${car.carClass.seasonId}/cars`
  );
}

export async function updateCarIracingId(formData: FormData) {
  await requireAdmin();
  const carId = String(formData.get("carId") ?? "");
  const raw = String(formData.get("iracingCarId") ?? "").trim();
  if (!carId) throw new Error("carId required");

  const iracingCarId = raw === "" ? null : /^\d+$/.test(raw) ? parseInt(raw, 10) : null;

  const car = await prisma.car.update({
    where: { id: carId },
    data: { iracingCarId },
    include: {
      carClass: {
        include: { season: { include: { league: true } } },
      },
    },
  });

  revalidatePath(
    `/admin/leagues/${car.carClass.season.league.slug}/seasons/${car.carClass.seasonId}/cars`
  );
}
