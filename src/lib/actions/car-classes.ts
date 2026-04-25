"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function createCarClass(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const displayOrderRaw = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(displayOrderRaw, 10) || 0;

  if (!name || !shortCode) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/new?error=Name+and+short+code+are+required`
    );
  }

  const existing = await prisma.carClass.findUnique({
    where: { seasonId_shortCode: { seasonId, shortCode } },
  });
  if (existing) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/new?error=Short+code+already+used+for+this+season`
    );
  }

  await prisma.carClass.create({
    data: { seasonId, name, shortCode, displayOrder },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}

export async function updateCarClass(
  leagueSlug: string,
  seasonId: string,
  classId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const displayOrderRaw = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(displayOrderRaw, 10) || 0;

  if (!name || !shortCode) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/${classId}/edit?error=Name+and+short+code+are+required`
    );
  }

  await prisma.carClass.update({
    where: { id: classId },
    data: { name, shortCode, displayOrder },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}

export async function deleteCarClass(
  leagueSlug: string,
  seasonId: string,
  classId: string
) {
  await requireAdmin();

  await prisma.registration.updateMany({
    where: { carClassId: classId },
    data: { carClassId: null },
  });

  await prisma.carClass.delete({ where: { id: classId } });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}
