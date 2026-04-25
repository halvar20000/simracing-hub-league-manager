"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

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
