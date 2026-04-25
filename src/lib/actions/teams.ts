"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function createTeam(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=Name+is+required`
    );
  }

  const existing = await prisma.team.findUnique({
    where: { seasonId_name: { seasonId, name } },
  });
  if (existing) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=A+team+with+that+name+already+exists`
    );
  }

  await prisma.team.create({
    data: { seasonId, name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function updateTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/${teamId}/edit?error=Name+is+required`
    );
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function deleteTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string
) {
  await requireAdmin();

  // First detach registrations from this team
  await prisma.registration.updateMany({
    where: { teamId },
    data: { teamId: null },
  });

  await prisma.team.delete({ where: { id: teamId } });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}
