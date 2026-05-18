"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

// Normalise a car name for comparison purposes only — lowercase, trim,
// collapse runs of whitespace, and strip diacritics so that
// "Lamborghini Huracán GT3 EVO" === "Lamborghini Huracan GT3 EVO". The
// original (display) name is preserved on the actual DB row.
function normaliseCarName(name: string): string {
  return name
    .normalize("NFD")
    // strip combining diacritical marks (U+0300 – U+036F)
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

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

/**
 * Add one or more cars from the IracingCar catalogue (the cached
 * snapshot from members-ng.iracing.com — populated by the
 * "Seed from JSON" button on /admin/iracing/cars) into the given
 * season's car list.
 *
 * Form payload:
 *   - seasonId           : target season
 *   - carClassId         : optional. When empty, cars are added as
 *                          season-wide shared (carClassId NULL) — the
 *                          default for new admins clicking the
 *                          "Pick from catalogue" button.
 *   - iracingCarIds      : repeated <input name="iracingCarIds"> from
 *                          checked checkboxes in the form.
 *
 * Dedup is by (seasonId, name) — re-running the same selection is
 * harmless; existing rows get their iracingCarId backfilled if it
 * happens to be missing.
 */
export async function addCarsFromCatalog(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "").trim();
  const carClassIdRaw = String(formData.get("carClassId") ?? "").trim();
  const carClassId = carClassIdRaw || null;
  const ids = formData
    .getAll("iracingCarIds")
    .map((v) => parseInt(String(v), 10))
    .filter((n) => Number.isFinite(n));

  if (!seasonId) throw new Error("seasonId required");
  if (ids.length === 0) {
    // Nothing selected — silently no-op so an accidental empty submit
    // doesn't error out.
    return;
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      _count: { select: { cars: true } },
    },
  });
  if (!season) throw new Error("Season not found");

  const catalog = await prisma.iracingCar.findMany({
    where: { iracingCarId: { in: ids } },
    select: { iracingCarId: true, name: true },
  });

  // Pre-load existing cars by lowercased name so we can dedupe across
  // both class-pinned and shared rows. addCarsBulk uses the same
  // normaliseCarName so the behaviour is consistent.
  const existingShared = await prisma.car.findMany({
    where: { seasonId, carClassId: null },
    select: { id: true, name: true, iracingCarId: true },
  });
  const existingByName = new Map(
    existingShared.map((c) => [normaliseCarName(c.name), c])
  );

  let order = season._count.cars;
  for (const cat of catalog) {
    const key = normaliseCarName(cat.name);
    const existing = existingByName.get(key);
    if (existing) {
      // Already added — make sure the iracingCarId is set on the row
      // so future imports match cleanly.
      if (existing.iracingCarId !== cat.iracingCarId) {
        try {
          await prisma.car.update({
            where: { id: existing.id },
            data: { iracingCarId: cat.iracingCarId },
          });
        } catch {
          /* another row already claimed this id; ignore */
        }
      }
      continue;
    }
    await prisma.car.create({
      data: {
        seasonId,
        carClassId,
        name: cat.name,
        iracingCarId: cat.iracingCarId,
        displayOrder: order,
      },
    });
    order++;
  }

  revalidatePath(
    `/admin/leagues/${season.league.slug}/seasons/${seasonId}/cars`
  );
}

export async function addCarsBulk(formData: FormData) {
  await requireAdmin();
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const seasonIdFromForm = String(formData.get("seasonId") ?? "").trim();
  const lines = String(formData.get("lines") ?? "").split(/\r?\n/);

  // Resolve seasonId + slug. The form supplies either a carClassId (we
  // derive seasonId from it) or, for shared / season-wide cars, a seasonId
  // directly with no carClassId.
  let seasonId: string;
  let leagueSlug: string;
  let baseOrder = 0;

  if (carClassId) {
    const cc = await prisma.carClass.findUnique({
      where: { id: carClassId },
      include: {
        _count: { select: { cars: true } },
        season: { include: { league: true } },
      },
    });
    if (!cc) throw new Error("CarClass not found");
    seasonId = cc.seasonId;
    leagueSlug = cc.season.league.slug;
    baseOrder = cc._count.cars;
  } else {
    if (!seasonIdFromForm) throw new Error("seasonId required");
    const s = await prisma.season.findUnique({
      where: { id: seasonIdFromForm },
      include: {
        league: true,
        _count: { select: { cars: true } },
      },
    });
    if (!s) throw new Error("Season not found");
    seasonId = s.id;
    leagueSlug = s.league.slug;
    baseOrder = s._count.cars;
  }

  let order = baseOrder;
  for (const raw of lines) {
    const parsed = parseLine(raw);
    if (!parsed) continue;

    if (carClassId) {
      await prisma.car.upsert({
        where: { carClassId_name: { carClassId, name: parsed.name } },
        update: { iracingCarId: parsed.iracingCarId },
        create: {
          seasonId,
          carClassId,
          name: parsed.name,
          iracingCarId: parsed.iracingCarId,
          displayOrder: order,
        },
      });
    } else {
      // Shared / season-wide car (carClassId NULL). The compound unique
      // (carClassId, name) doesn't enforce uniqueness for NULL in Postgres,
      // so do a manual lookup and skip if already present. Compare with
      // accent / case insensitive normalisation so e.g. "Huracan" doesn't
      // duplicate an existing "Huracán" row.
      const allShared = await prisma.car.findMany({
        where: { seasonId, carClassId: null },
        select: { id: true, name: true },
      });
      const want = normaliseCarName(parsed.name);
      const existing =
        allShared.find((c) => normaliseCarName(c.name) === want) ?? null;
      if (existing) {
        if (parsed.iracingCarId !== null) {
          await prisma.car.update({
            where: { id: existing.id },
            data: { iracingCarId: parsed.iracingCarId },
          });
        }
      } else {
        await prisma.car.create({
          data: {
            seasonId,
            carClassId: null,
            name: parsed.name,
            iracingCarId: parsed.iracingCarId,
            displayOrder: order,
          },
        });
      }
    }
    order++;
  }

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/cars`
  );
}

export async function deleteCar(formData: FormData) {
  await requireAdmin();
  const carId = String(formData.get("carId") ?? "");
  if (!carId) throw new Error("carId required");

  const car = await prisma.car.findUnique({
    where: { id: carId },
    include: {
      season: { include: { league: true } },
    },
  });
  if (!car) return;

  await prisma.car.delete({ where: { id: carId } });

  revalidatePath(
    `/admin/leagues/${car.season.league.slug}/seasons/${car.seasonId}/cars`
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
      season: { include: { league: true } },
    },
  });

  revalidatePath(
    `/admin/leagues/${car.season.league.slug}/seasons/${car.seasonId}/cars`
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

  // Also pick up season-wide shared cars from the source (carClassId null).
  const sourceSharedCars = await prisma.car.findMany({
    where: { seasonId: source.id, carClassId: null },
    orderBy: { displayOrder: "asc" },
    select: {
      name: true,
      shortName: true,
      iracingCarId: true,
      displayOrder: true,
    },
  });

  // Existing classes in target keyed by uppercase shortCode so we don't
  // create duplicates.
  const existingClasses = await prisma.carClass.findMany({
    where: { seasonId: target.id },
    select: { id: true, shortCode: true },
  });
  const existingByShort = new Map(
    existingClasses.map((c) => [c.shortCode.toUpperCase(), c.id])
  );

  // First pass: just create the CarClasses in the destination (no cars
  // yet). We need every dest class to exist before we can decide whether a
  // car should be pinned to one class or promoted to shared.
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
  }

  // Second pass: walk every source car (across all classes) and bucket by
  // lowercased name. A name that appears in 2+ source classes is the
  // PRO/AM-style duplicated pattern → promote to a single shared car in
  // the destination (carClassId = null). A name that appears in only one
  // source class stays pinned to that class (e.g. IEC LMP2-only car).
  type SourceCarRef = {
    name: string;
    shortName: string | null;
    iracingCarId: number | null;
    displayOrder: number;
    sourceClassShortCode: string;
  };
  const carsByName = new Map<string, SourceCarRef[]>();
  for (const sc of source.carClasses) {
    for (const car of sc.cars) {
      const key = normaliseCarName(car.name);
      const bucket = carsByName.get(key) ?? [];
      bucket.push({
        name: car.name,
        shortName: car.shortName,
        iracingCarId: car.iracingCarId,
        displayOrder: car.displayOrder,
        sourceClassShortCode: sc.shortCode,
      });
      carsByName.set(key, bucket);
    }
  }

  // Pre-load what's already in the destination so re-running the copy is
  // safe / idempotent. We compare names via normaliseCarName so accent /
  // case / whitespace differences don't create duplicates (e.g. a manually
  // added "Lamborghini Huracán GT3 EVO" matches a source-side "Huracan").
  const existingDestCars = await prisma.car.findMany({
    where: { seasonId: target.id },
    select: { name: true, carClassId: true },
  });
  const haveSharedInDest = new Set(
    existingDestCars
      .filter((c) => c.carClassId === null)
      .map((c) => normaliseCarName(c.name))
  );
  const havePinnedInDest = new Set(
    existingDestCars
      .filter((c) => c.carClassId !== null)
      .map((c) => `${c.carClassId}::${normaliseCarName(c.name)}`)
  );

  for (const [key, occurrences] of carsByName) {
    // If this car is already in the destination as a shared car, skip — the
    // shared car covers every class.
    if (haveSharedInDest.has(key)) continue;

    const first = occurrences[0]!;
    const appearsInMultipleClasses = occurrences.length > 1;

    if (appearsInMultipleClasses) {
      // Promote to a single shared (season-wide) car in the destination.
      await prisma.car.create({
        data: {
          seasonId: target.id,
          carClassId: null,
          name: first.name,
          shortName: first.shortName,
          iracingCarId: first.iracingCarId,
          displayOrder: first.displayOrder,
        },
      });
      haveSharedInDest.add(key);
    } else {
      // Genuinely class-specific car — keep it pinned in the destination
      // class matching the source class's shortCode.
      const destClassId = existingByShort.get(
        first.sourceClassShortCode.toUpperCase()
      );
      if (!destClassId) continue;
      const dupKey = `${destClassId}::${key}`;
      if (havePinnedInDest.has(dupKey)) continue;
      await prisma.car.create({
        data: {
          seasonId: target.id,
          carClassId: destClassId,
          name: first.name,
          shortName: first.shortName,
          iracingCarId: first.iracingCarId,
          displayOrder: first.displayOrder,
        },
      });
      havePinnedInDest.add(dupKey);
    }
  }

  // Copy shared (season-wide, carClassId=null) cars from source into target.
  // Also accent / case insensitive so we don't double-up on a "Huracán" the
  // admin already added manually.
  if (sourceSharedCars.length > 0) {
    const existingShared = await prisma.car.findMany({
      where: { seasonId: target.id, carClassId: null },
      select: { name: true },
    });
    const haveShared = new Set(
      existingShared.map((c) => normaliseCarName(c.name))
    );
    // The pinned-promotion step above may have just added shared cars too,
    // so seed those in to avoid re-adding here.
    for (const k of haveSharedInDest) haveShared.add(k);

    for (const car of sourceSharedCars) {
      const key = normaliseCarName(car.name);
      if (haveShared.has(key)) continue;
      await prisma.car.create({
        data: {
          seasonId: target.id,
          carClassId: null,
          name: car.name,
          shortName: car.shortName,
          iracingCarId: car.iracingCarId,
          displayOrder: car.displayOrder,
        },
      });
      haveShared.add(key);
    }
  }

  revalidatePath(
    `/admin/leagues/${target.league.slug}/seasons/${target.id}/cars`
  );
}

