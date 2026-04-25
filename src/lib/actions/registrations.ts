"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect("/leagues");
  }

  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}?error=Registration+is+not+open`
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
  if (
    !user ||
    !user.firstName ||
    !user.lastName ||
    !user.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const teamIdFromDropdown =
    String(formData.get("teamId") ?? "").trim() || null;
  const newTeamName = String(formData.get("newTeamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Resolve team:
  //   - If newTeamName is provided, find or create that team (it wins)
  //   - Otherwise use the team from the dropdown
  let teamId: string | null = teamIdFromDropdown;
  if (newTeamName) {
    const existingTeam = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId, name: newTeamName } },
    });
    if (existingTeam) {
      teamId = existingTeam.id;
    } else {
      const created = await prisma.team.create({
        data: { seasonId, name: newTeamName },
      });
      teamId = created.id;
    }
  }

  if (season.isMulticlass && !carClassId) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Class+is+required+for+multiclass+seasons`
    );
  }

  const existing = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId, userId: user.id } },
  });

  if (existing && existing.status === "APPROVED") {
    redirect(
      `/registrations?error=You+are+already+approved+for+this+season`
    );
  }

  if (existing) {
    await prisma.registration.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
        approvedById: null,
        approvedAt: null,
      },
    });
  } else {
    await prisma.registration.create({
      data: {
        seasonId,
        userId: user.id,
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
      },
    });
  }

  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`
  );
  redirect("/registrations?success=1");
}

export async function withdrawRegistration(registrationId: string) {
  const sessionUser = await requireAuth();

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { season: { include: { league: true } } },
  });
  if (!reg || reg.userId !== sessionUser.id) {
    redirect("/registrations");
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath("/registrations");
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  redirect("/registrations");
}
