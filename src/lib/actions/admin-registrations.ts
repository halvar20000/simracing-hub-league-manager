"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { RegistrationStatus, ProAmClass } from "@prisma/client";

export async function approveRegistration(registrationId: string) {
  const admin = await requireAdmin();

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "APPROVED",
      approvedById: admin.id,
      approvedAt: new Date(),
    },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  revalidatePath(
    `/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}`
  );
}

export async function rejectRegistration(registrationId: string) {
  await requireAdmin();

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "REJECTED",
      approvedById: null,
      approvedAt: null,
    },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}

export async function updateRegistration(
  leagueSlug: string,
  seasonId: string,
  registrationId: string,
  formData: FormData
) {
  const admin = await requireAdmin();

  const status = String(formData.get("status") ?? "PENDING") as RegistrationStatus;
  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const teamId = String(formData.get("teamId") ?? "").trim() || null;
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const proAmClassRaw = String(formData.get("proAmClass") ?? "").trim();
  const proAmClass: ProAmClass | null =
    proAmClassRaw === "PRO" || proAmClassRaw === "AM"
      ? (proAmClassRaw as ProAmClass)
      : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const baseData = {
    status,
    startNumber,
    teamId,
    carClassId,
    proAmClass,
    notes,
  };

  const data =
    status === "APPROVED"
      ? { ...baseData, approvedById: admin.id, approvedAt: new Date() }
      : { ...baseData, approvedById: null, approvedAt: null };

  await prisma.registration.update({
    where: { id: registrationId },
    data,
  });

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`);
}
