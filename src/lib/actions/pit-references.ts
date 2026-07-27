"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const PATH = "/admin/pit-references";

function num(v: FormDataEntryValue | null): number {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
function optNum(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}

/** Create or update one car (+ track) entry. */
export async function savePitReference(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData.get("id"));
  const car = str(formData.get("car"));
  const track = str(formData.get("track"));
  if (!car) {
    redirect(PATH + "?error=" + encodeURIComponent("A car name is required"));
  }
  const data = {
    car,
    track,
    tankSizeL: optNum(formData.get("tankSizeL")),
    laneLossSec: num(formData.get("laneLossSec")),
    refuelLps: num(formData.get("refuelLps")),
    tyreChangeSec: num(formData.get("tyreChangeSec")),
    driverChangeSec: num(formData.get("driverChangeSec")) || 30,
    tyreSequential: str(formData.get("tyreSequential")) === "on",
    tyreWearPctPerLap: optNum(formData.get("tyreWearPctPerLap")),
    source: str(formData.get("source")) || null,
    notes: str(formData.get("notes")) || null,
    updatedById: admin.id,
  };

  if (id) {
    await prisma.pitReference.update({ where: { id }, data });
  } else {
    await prisma.pitReference.upsert({
      where: { car_track: { car, track } },
      create: data,
      update: data,
    });
  }
  revalidatePath(PATH);
  redirect(PATH + "?ok=" + encodeURIComponent(`Saved ${car}${track ? ` @ ${track}` : ""}`));
}

export async function deletePitReference(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData.get("id"));
  if (id) await prisma.pitReference.delete({ where: { id } }).catch(() => null);
  revalidatePath(PATH);
  redirect(PATH + "?ok=" + encodeURIComponent("Entry deleted"));
}
