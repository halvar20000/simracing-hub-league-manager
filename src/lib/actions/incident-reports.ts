"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import type { EvidenceKind } from "@prisma/client";

export async function createIncidentReport(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();

  const reporterReg = await prisma.registration.findFirst({
    where: { seasonId, userId: sessionUser.id, status: "APPROVED" },
  });
  if (!reporterReg) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=Only+approved+drivers+can+file+reports`
    );
  }

  const round = await prisma.round.findFirst({
    where: { id: roundId, seasonId },
  });
  if (!round) {
    redirect(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  }

  const lapNumberRaw = String(formData.get("lapNumber") ?? "").trim();
  const lapNumber = lapNumberRaw ? parseInt(lapNumberRaw, 10) : null;
  const turnOrSector =
    String(formData.get("turnOrSector") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  const involvedNumbersRaw = String(
    formData.get("involvedStartNumbers") ?? ""
  ).trim();
  const involvedRegistrationIds = formData
    .getAll("involvedRegistrationIds")
    .map((v) => String(v).trim())
    .filter(Boolean);
  const evidenceLinksRaw = String(formData.get("evidenceLinks") ?? "").trim();

  if (!description) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/report?error=Description+is+required`
    );
  }

  const report = await prisma.incidentReport.create({
    data: {
      roundId,
      reporterUserId: sessionUser.id,
      reporterRegistrationId: reporterReg.id,
      lapNumber,
      turnOrSector,
      description,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  // Reporter is always tagged
  await prisma.incidentReportInvolvedDriver.create({
    data: {
      incidentReportId: report.id,
      registrationId: reporterReg.id,
      role: "REPORTER",
    },
  });

  // Tag drivers selected via the picker (preferred)
  for (const regId of involvedRegistrationIds) {
    if (regId === reporterReg.id) continue;
    const reg = await prisma.registration.findFirst({
      where: { id: regId, seasonId, status: "APPROVED" },
    });
    if (!reg) continue;
    await prisma.incidentReportInvolvedDriver
      .create({
        data: {
          incidentReportId: report.id,
          registrationId: reg.id,
          role: "ACCUSED",
        },
      })
      .catch(() => {
        /* duplicate */
      });
  }

  // Parse involved start numbers → match to season's roster → tag as ACCUSED
  if (involvedNumbersRaw) {
    const numbers = involvedNumbersRaw
      .split(/[,;\s]+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    for (const num of numbers) {
      const reg = await prisma.registration.findFirst({
        where: { seasonId, startNumber: num, status: "APPROVED" },
      });
      if (!reg || reg.id === reporterReg.id) continue;
      await prisma.incidentReportInvolvedDriver
        .create({
          data: {
            incidentReportId: report.id,
            registrationId: reg.id,
            role: "ACCUSED",
          },
        })
        .catch(() => {
          // ignore duplicates
        });
    }
  }

  // Parse evidence (one URL per line) and detect kind
  if (evidenceLinksRaw) {
    const lines = evidenceLinksRaw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      let kind: EvidenceKind = "URL";
      const lc = line.toLowerCase();
      if (lc.includes("youtu.be") || lc.includes("youtube.com"))
        kind = "YOUTUBE_LINK";
      else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(line))
        kind = "IMAGE_URL";
      await prisma.incidentReportEvidence.create({
        data: {
          incidentReportId: report.id,
          kind,
          content: line,
          addedByUserId: sessionUser.id,
        },
      });
    }
  }

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath("/reports");
  redirect("/reports?success=1");
}

export async function withdrawIncidentReport(reportId: string) {
  const sessionUser = await requireAuth();
  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
  });
  if (!report || report.reporterUserId !== sessionUser.id) {
    redirect("/reports");
  }
  if (report.status !== "SUBMITTED") {
    redirect("/reports?error=Cannot+withdraw+a+report+already+under+review");
  }
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "WITHDRAWN" },
  });
  revalidatePath("/reports");
  redirect("/reports");
}
