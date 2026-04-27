"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { SeasonStatus, TeamScoringMode } from "@prisma/client";

export async function createSeason(leagueSlug: string, formData: FormData) {
  await requireAdmin();

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
  });
  if (!league) redirect("/admin/leagues");

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  const scoringSystemId = String(formData.get("scoringSystemId") ?? "");
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  if (!name || !year || !scoringSystemId) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/new?error=Name%2C+year+and+scoring+system+are+required`
    );
  }

  const created = await prisma.season.create({
    data: {
      leagueId: league.id,
      name,
      year,
      scoringSystemId,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${created.id}`);
}

export async function updateSeason(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  const scoringSystemId = String(formData.get("scoringSystemId") ?? "");
  const status = String(formData.get("status") ?? "DRAFT") as SeasonStatus;
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  await prisma.season.update({
    where: { id: seasonId },
    data: {
      irlmLeagueName,
      irlmSeasonId,
      name,
      year,
      scoringSystemId,
      status,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteSeason(leagueSlug: string, seasonId: string) {
  await requireAdmin();
  await prisma.season.delete({ where: { id: seasonId } });
  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}`);
}
