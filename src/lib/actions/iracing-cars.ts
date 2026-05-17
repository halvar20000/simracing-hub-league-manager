"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import seedCars from "@/data/iracing-cars.json";

interface SeedCar {
  iracingCarId: number;
  name: string;
  category?: string | null;
}

// Synthetic-ID ranges (analogous to IracingTrack):
//   real iRacing IDs   : as-is (well below 1000)
//   99001 – 99999      : reserved for the curated JSON's "best-effort"
//                        entries whose real iRacing ID we don't know
//   100001+            : reserved for manually-added rows via the
//                        admin form
const MANUAL_ID_BASE = 100001;

/**
 * Seed (upsert) the IracingCar cache from src/data/iracing-cars.json.
 * Idempotent — keyed on iracingCarId.
 *
 * Note: iRacing's live /data/car/get is currently unreachable because
 * the OAuth2 client registration is paused; this static seed is the
 * data source until that situation changes.
 */
export async function refreshIracingCars(): Promise<void> {
  await requireAdmin();

  let imported = 0;
  // No transaction wrapper — each upsert is independent + idempotent,
  // and Neon's interactive-transaction default timeout is 5 s which can
  // be tight when seeding hundreds of rows in series.
  try {
    const cars = seedCars as SeedCar[];
    for (const c of cars) {
      if (!c.iracingCarId || !c.name) continue;
      await prisma.iracingCar.upsert({
        where: { iracingCarId: c.iracingCarId },
        update: {
          name: c.name,
          category: c.category ?? null,
          cachedAt: new Date(),
        },
        create: {
          iracingCarId: c.iracingCarId,
          name: c.name,
          category: c.category ?? null,
        },
      });
      imported++;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    redirect(
      `/admin/iracing/cars?ok=${imported}&error=${encodeURIComponent(msg)}`
    );
  }

  revalidatePath("/admin/iracing/cars");
  redirect(`/admin/iracing/cars?ok=${imported}`);
}

/**
 * Admin form on /admin/iracing/cars for adding a single new car by
 * hand — e.g. iRacing released a new car and the curated JSON hasn't
 * been updated yet. Allocates a synthetic ID in the MANUAL_ID_BASE
 * range. Idempotent on name (case-insensitive).
 */
export async function addIracingCarManually(formData: FormData): Promise<void> {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const categoryRaw = String(formData.get("category") ?? "").trim();
  const category = categoryRaw || null;

  if (!name) {
    redirect(
      "/admin/iracing/cars?error=" + encodeURIComponent("Car name is required.")
    );
  }

  const existing = await prisma.iracingCar.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { iracingCarId: true },
  });

  if (existing) {
    await prisma.iracingCar.update({
      where: { iracingCarId: existing.iracingCarId },
      data: {
        name,
        category: category ?? undefined,
        cachedAt: new Date(),
      },
    });
    revalidatePath("/admin/iracing/cars");
    redirect("/admin/iracing/cars?ok=1");
  }

  const max = await prisma.iracingCar.aggregate({
    _max: { iracingCarId: true },
    where: { iracingCarId: { gte: MANUAL_ID_BASE } },
  });
  const nextId = Math.max(
    MANUAL_ID_BASE,
    (max._max.iracingCarId ?? MANUAL_ID_BASE - 1) + 1
  );

  await prisma.iracingCar.create({
    data: {
      iracingCarId: nextId,
      name,
      category,
    },
  });

  revalidatePath("/admin/iracing/cars");
  redirect("/admin/iracing/cars?ok=1");
}

/**
 * Delete a single IracingCar row. Just removes the row — won't affect
 * Car rows on individual seasons (which carry their own iracingCarId
 * snapshot at registration time).
 */
export async function deleteIracingCar(formData: FormData): Promise<void> {
  await requireAdmin();
  const idRaw = String(formData.get("iracingCarId") ?? "").trim();
  const iracingCarId = parseInt(idRaw, 10);
  if (!Number.isFinite(iracingCarId)) {
    redirect(
      "/admin/iracing/cars?error=" +
        encodeURIComponent("Missing or invalid iracingCarId.")
    );
  }
  await prisma.iracingCar
    .delete({ where: { iracingCarId } })
    .catch(() => {
      /* already gone — ignore */
    });
  revalidatePath("/admin/iracing/cars");
  redirect("/admin/iracing/cars?ok=1");
}
