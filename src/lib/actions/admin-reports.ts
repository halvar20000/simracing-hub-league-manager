"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireSteward } from "@/lib/auth-helpers";
import { pointsForLevel } from "@/lib/penalty-categories";
import type { IncidentStatus, Verdict, PenaltyCategory } from "@prisma/client";

export async function setReportStatus(
  leagueSlug: string,
  seasonId: string,
  reportId: string,
  status: IncidentStatus
) {
  await requireSteward();
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status },
  });
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`);
}

export async function submitDecision(
  leagueSlug: string,
  seasonId: string,
  reportId: string,
  formData: FormData
) {
  const admin = await requireSteward();

  const verdict = String(formData.get("verdict") ?? "NO_ACTION") as Verdict;
  const publicSummary = String(formData.get("publicSummary") ?? "").trim();
  const internalNotes =
    String(formData.get("internalNotes") ?? "").trim() || null;
  const publish = formData.get("publish") === "on";

  const accusedRegistrationId =
    String(formData.get("accusedRegistrationId") ?? "").trim() || null;
  let pointsValueRaw = String(formData.get("pointsValue") ?? "").trim();
  let pointsValue = pointsValueRaw ? Math.abs(parseInt(pointsValueRaw, 10) || 0) : 0;
  const timePenaltySecondsRaw = String(
    formData.get("timePenaltySeconds") ?? ""
  ).trim();
  const timePenaltySeconds = timePenaltySecondsRaw
    ? parseInt(timePenaltySecondsRaw, 10)
    : null;
  const gridPositionsRaw = String(formData.get("gridPositions") ?? "").trim();
  const gridPositions = gridPositionsRaw
    ? parseInt(gridPositionsRaw, 10)
    : null;
  const reason = (
    String(formData.get("penaltyReason") ?? "").trim() || publicSummary
  );
  const penaltyCategoryRaw = String(formData.get("penaltyCategory") ?? "").trim();
  const penaltyCategory = penaltyCategoryRaw
    ? (penaltyCategoryRaw as PenaltyCategory)
    : null;

  const categoryLevelRaw = String(formData.get("categoryLevel") ?? "").trim();
  const categoryLevel =
    categoryLevelRaw === "" ? null : parseInt(categoryLevelRaw, 10);

  if (!publicSummary) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}?error=Public+summary+is+required`
    );
  }

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { include: { season: { include: { scoringSystem: true } } } },
    },
  });
  const scoringSystemForCat =
    report?.round.season.scoringSystem ?? null;
  const categoryDerivedPoints = pointsForLevel(scoringSystemForCat, categoryLevel);
  if (categoryLevel != null) {
    pointsValue = categoryDerivedPoints;
  }
  if (!report) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  }

  const decision = await prisma.incidentDecision.upsert({
    where: { incidentReportId: reportId },
    create: {
      incidentReportId: reportId,
      decidedByUserId: admin.id,
      decidedAt: new Date(),
      verdict,
      publicSummary,
      internalNotes,
      publishedAt: publish ? new Date() : null,
    },
    update: {
      decidedByUserId: admin.id,
      decidedAt: new Date(),
      verdict,
      publicSummary,
      internalNotes,
      publishedAt: publish ? new Date() : null,
    },
  });

  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: publish ? "DECIDED" : "UNDER_REVIEW" },
  });

  // Replace any existing penalties from this decision
  await prisma.penalty.deleteMany({
    where: { sourceIncidentDecisionId: decision.id },
  });

  if (
    accusedRegistrationId &&
    (verdict === "POINTS_DEDUCTION" ||
      verdict === "TIME_PENALTY" ||
      verdict === "GRID_PENALTY_NEXT_ROUND")
  ) {
    const type =
      verdict === "POINTS_DEDUCTION"
        ? "POINTS_DEDUCTION"
        : verdict === "TIME_PENALTY"
        ? "TIME_PENALTY"
        : "GRID_PENALTY";

    await prisma.penalty.create({
      data: {
        registrationId: accusedRegistrationId,
        roundId: report.roundId,
        source: "INCIDENT_DECISION",
        sourceIncidentDecisionId: decision.id,
        type,
        pointsValue: verdict === "POINTS_DEDUCTION" ? pointsValue : null,
        timePenaltySeconds: verdict === "TIME_PENALTY" ? timePenaltySeconds : null,
        gridPositions: verdict === "GRID_PENALTY_NEXT_ROUND" ? gridPositions : null,
        reason,
        category: penaltyCategory,
        categoryLevel,
      },
    });
  }

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`
  );
}

export async function deleteDecision(
  leagueSlug: string,
  seasonId: string,
  reportId: string
) {
  await requireSteward();
  const decision = await prisma.incidentDecision.findUnique({
    where: { incidentReportId: reportId },
  });
  if (decision) {
    await prisma.penalty.deleteMany({
      where: { sourceIncidentDecisionId: decision.id },
    });
    await prisma.incidentDecision.delete({
      where: { incidentReportId: reportId },
    });
  }
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "UNDER_REVIEW" },
  });
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
}
