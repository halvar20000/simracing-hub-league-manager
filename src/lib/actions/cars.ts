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

export async function addCarClass(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const iracingIdsRaw = String(formData.get("iracingCarClassIds") ?? "").trim();

  if (!seasonId) throw new Error("seasonId required");
  if (!name) throw new Error("name required");
  if (!shortCode) throw new Error("shortCode required");

  const iracingCarClassIds = iracingIdsRaw
    ? iracingIdsRaw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => /^\d+$/.test(s))
        .map((s) => parseInt(s, 10))
    : [];

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      _count: { select: { carClasses: true } },
    },
  });
  if (!season) throw new Error("Season not found");

  await prisma.carClass.create({
    data: {
      seasonId,
      name,
      shortCode,
      iracingCarClassIds,
      displayOrder: season._count.carClasses,
    },
  });

  revalidatePath(
    `/admin/leagues/${season.league.slug}/seasons/${seasonId}/cars`
  );
}

export async function deleteCarClass(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");

  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      season: { include: { league: true } },
      _count: {
        select: {
          cars: true,
          registrations: true,
          teamResults: true,
        },
      },
    },
  });
  if (!cc) return;

  // Refuse to delete a class that already has registrations / results.
  if (cc._count.registrations > 0 || cc._count.teamResults > 0) {
    throw new Error(
      "Cannot delete a class that already has registrations or race results."
    );
  }

  await prisma.carClass.delete({ where: { id: carClassId } });

  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}

export async function toggleCarClassLock(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "");
  if (!carClassId) throw new Error("carClassId required");
  const cc = await prisma.carClass.findUnique({
    where: { id: carClassId },
    include: {
      season: { include: { league: true } },
    },
  });
  if (!cc) throw new Error("CarClass not found");
  await prisma.carClass.update({
    where: { id: carClassId },
    data: { isLocked: !cc.isLocked },
  });
  revalidatePath(
    `/admin/leagues/${cc.season.league.slug}/seasons/${cc.seasonId}/cars`
  );
}

/**
 * Copy all CarClasses (+ their Cars) from the most recent prior season of
 * the same league into the target season. Skips classes whose shortCode
 * already exists in the target. Cars are skipped if a car with the same
 * name already exists in the destination class.
 *
 * Triggered from a button on /admin/leagues/[slug]/seasons/[seasonId]/cars
 * with name="seasonId" in the form body.
 */
export async function copyClassesAndCarsFromPreviousSeason(
  formData: FormData
): Promise<void> {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");

  const target = await prisma.season.findUnique({
    where: { id: seasonId },
    select: {
      id: true,
      leagueId: true,
      createdAt: true,
      league: { select: { slug: true } },
    },
  });
  if (!target) throw new Error("Target season not found");

  const source = await prisma.season.findFirst({
    where: {
      leagueId: target.leagueId,
      id: { not: target.id },
      createdAt: { lt: target.createdAt },
    },
    orderBy: { createdAt: "desc" },
    include: {
      carClasses: {
        include: { cars: { orderBy: { displayOrder: "asc" } } },
        orderBy: { displayOrder: "asc" },
      },
    },
  });
  if (!source) {
    // Nothing to copy — silently succeed so the form submit completes.
    revalidatePath(
      `/admin/leagues/${target.league.slug}/seasons/${target.id}/cars`
    );
    return;
  }

  // Existing classes in target keyed by uppercase shortCode so we don't
  // create duplicates.
  const existingClasses = await prisma.carClass.findMany({
    where: { seasonId: target.id },
    select: { id: true, shortCode: true },
  });
  const existingByShort = new Map(
    existingClasses.map((c) => [c.shortCode.toUpperCase(), c.id])
  );

  for (const sc of source.carClasses) {
    let destClassId = existingByShort.get(sc.shortCode.toUpperCase());
    if (!destClassId) {
      const created = await prisma.carClass.create({
        data: {
          seasonId: target.id,
          name: sc.name,
          shortCode: sc.shortCode,
          displayOrder: sc.displayOrder,
          iracingCarClassId: sc.iracingCarClassId,
          iracingCarClassIds: sc.iracingCarClassIds,
        },
        select: { id: true, shortCode: true },
      });
      destClassId = created.id;
      existingByShort.set(created.shortCode.toUpperCase(), destClassId);
    }

    const existingCars = await prisma.car.findMany({
      where: { carClassId: destClassId },
      select: { name: true },
    });
    const have = new Set(existingCars.map((c) => c.name.toLowerCase()));

    for (const car of sc.cars) {
      if (have.has(car.name.toLowerCase())) continue;
      await prisma.car.create({
        data: {
          seasonId: target.id,
          carClassId: destClassId,
          name: car.name,
          shortName: car.shortName,
          iracingCarId: car.iracingCarId,
          displayOrder: car.displayOrder,
        },
      });
      have.add(car.name.toLowerCase());
    }
  }

  revalidatePath(
    `/admin/leagues/${target.league.slug}/seasons/${target.id}/cars`
  );
}

