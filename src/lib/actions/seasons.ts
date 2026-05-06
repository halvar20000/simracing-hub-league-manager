"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { SeasonStatus, TeamScoringMode } from "@prisma/client";
import { getTemplate } from "@/lib/league-templates";

export async function createSeason(leagueSlug: string, formData: FormData) {
  await requireAdmin();

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
  });
  if (!league) redirect("/admin/leagues");

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  let scoringSystemId = String(formData.get("scoringSystemId") ?? "").trim();
  const templateId = String(formData.get("template") ?? "").trim() || null;
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

  // If a template is chosen and no existing scoring system was selected,
  // auto-create a new ScoringSystem from the template defaults.
  if (!scoringSystemId && templateId) {
    const tpl = getTemplate(templateId);
    if (!tpl) {
      redirect(
        `/admin/leagues/${leagueSlug}/seasons/new?error=Unknown+template`
      );
    }
    const t = tpl!;
    // Distinguish the auto-created system per league/season name so admins
    // can find it later.
    const ssName = `${t.scoringSystem.name} – ${league.name}${name ? " / " + name : ""}`;
    const ss = await prisma.scoringSystem.create({
      data: {
        name: ssName,
        racesPerRound: t.scoringSystem.racesPerRound,
        pointsTable: t.scoringSystem.pointsTable,
        pointsTableRace2: t.scoringSystem.pointsTableRace2 ?? undefined,
        participationPoints: t.scoringSystem.participationPoints,
        participationInCombined: t.scoringSystem.participationInCombined,
        racePointsMinDistancePct: t.scoringSystem.racePointsMinDistancePct,
        participationMinDistancePct: t.scoringSystem.participationMinDistancePct,
        bonusPole: t.scoringSystem.bonusPole,
        bonusFastestLap: t.scoringSystem.bonusFastestLap,
        bonusMostLapsLed: t.scoringSystem.bonusMostLapsLed,
        dropWorstNRounds: t.scoringSystem.dropWorstNRounds,
      },
    });
    scoringSystemId = ss.id;
  }

  if (!name || !year || !scoringSystemId) {
    const params = new URLSearchParams({
      error: "Name, year and scoring system are required",
    });
    if (templateId) params.set("template", templateId);
    redirect(`/admin/leagues/${leagueSlug}/seasons/new?${params.toString()}`);
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

  const irlmLeagueName = String(formData.get("irlmLeagueName") ?? "").trim() || null;
  const irlmSeasonIdRaw = String(formData.get("irlmSeasonId") ?? "").trim();
  const irlmSeasonId = irlmSeasonIdRaw ? parseInt(irlmSeasonIdRaw, 10) : null;

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

export async function regenerateRegistrationToken(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const token = crypto.randomUUID();
  const season = await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: token },
    include: { league: true },
  });
  revalidatePath(`/admin/leagues/${season.league.slug}/seasons/${season.id}`);
}

export async function clearRegistrationToken(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const season = await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: null },
    include: { league: true },
  });
  revalidatePath(`/admin/leagues/${season.league.slug}/seasons/${season.id}`);
}

export async function toggleSeasonTeamRegistration(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season) throw new Error("Season not found");
  await prisma.season.update({
    where: { id: seasonId },
    data: { teamRegistration: !season.teamRegistration },
  });
  revalidatePath(
    `/admin/leagues/${season.league.slug}/seasons/${seasonId}`
  );
}

