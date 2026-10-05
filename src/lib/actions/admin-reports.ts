"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSteward } from "@/lib/auth-helpers";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";
import {
  pointsForLevel,
  isSpecialMeasureLevel,
} from "@/lib/penalty-categories";
import { recomputeRoundScoring } from "@/lib/scoring";
import type {
  EvidenceKind,
  IncidentStatus,
  RaceSession,
  Verdict,
} from "@prisma/client";

/**
 * Undo every disqualification a decision applied.
 *
 * A DQ'd result carries `dsqDecisionId` (which decision did it) and
 * `dsqPreviousStatus` (what it was before), so editing the verdict, removing a
 * driver from the list, deleting the decision or deleting the whole report can
 * all put the result back exactly as it was. Returns the round ids that were
 * touched so the caller can re-score them.
 *
 * `keepResultIds` are the results that should STAY disqualified (the ones the
 * steward just re-selected); everything else this decision owns is reverted.
 */
async function revertDsqForDecision(
  decisionId: string,
  keepResultIds: string[] = []
): Promise<Set<string>> {
  const touched = new Set<string>();
  const owned = await prisma.raceResult.findMany({
    where: { dsqDecisionId: decisionId },
    select: {
      id: true,
      roundId: true,
      dsqPreviousStatus: true,
    },
  });
  for (const r of owned) {
    if (keepResultIds.includes(r.id)) continue;
    await prisma.raceResult.update({
      where: { id: r.id },
      data: {
        // Legacy rows without a stored previous status fall back to
        // CLASSIFIED — the only status a DQ'd driver can sensibly return to.
        finishStatus: r.dsqPreviousStatus ?? "CLASSIFIED",
        dsqDecisionId: null,
        dsqPreviousStatus: null,
      },
    });
    touched.add(r.roundId);
  }
  return touched;
}

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

  // Results the steward ticked for disqualification. Only honoured when the
  // verdict actually IS "Disqualifikation" — ticking a box under any other
  // verdict must not silently wipe someone's race.
  const dsqResultIds =
    verdict === "DISQUALIFICATION"
      ? formData
          .getAll("dsqResultIds")
          .map((v) => String(v))
          .filter(Boolean)
      : [];

  // Multiple penalty recipients: one row per driver, each with its own
  // category level (→ points) and its own public reason. The reporter and any
  // round participant can be selected.
  //
  // Category 4 = Sondermaßnahme: no points, a free-text measure instead, and
  // it is saved regardless of the verdict (a special measure can accompany a
  // warning, a reprimand or even "no action").
  type PenaltyRowInput = {
    registrationId: string;
    level: number | null;
    reason: string;
    specialMeasure: string;
  };
  let penaltyRows: PenaltyRowInput[] = [];
  try {
    const parsed: unknown = JSON.parse(
      String(formData.get("penaltiesJson") ?? "[]")
    );
    if (Array.isArray(parsed)) {
      penaltyRows = parsed
        .filter(
          (r): r is { registrationId: string; level?: unknown; reason?: unknown } =>
            !!r &&
            typeof (r as { registrationId?: unknown }).registrationId ===
              "string" &&
            ((r as { registrationId: string }).registrationId.length > 0)
        )
        .map((r) => {
          const row = r as {
            registrationId: string;
            level?: unknown;
            reason?: unknown;
            specialMeasure?: unknown;
          };
          return {
            registrationId: row.registrationId,
            level:
              row.level === null || row.level === undefined
                ? null
                : Number(row.level),
            reason: typeof row.reason === "string" ? row.reason.trim() : "",
            specialMeasure:
              typeof row.specialMeasure === "string"
                ? row.specialMeasure.trim()
                : "",
          };
        });
    }
  } catch {
    penaltyRows = [];
  }

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
  const scoringSystemForCat = report?.round.season.scoringSystem ?? null;
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

  // Rows to persist:
  //  * points rows (category 0–3) only when the verdict IS "points deduction"
  //  * special-measure rows (category 4) under ANY verdict — they carry no
  //    points, just the free-text measure.
  const rowsToSave = penaltyRows.filter((row) =>
    isSpecialMeasureLevel(row.level) ? true : verdict === "POINTS_DEDUCTION"
  );

  if (rowsToSave.length > 0) {
    // One penalty per selected driver; de-dupe in case the same driver was
    // picked twice.
    const seen = new Set<string>();
    for (const row of rowsToSave) {
      if (seen.has(row.registrationId)) continue;
      seen.add(row.registrationId);

      if (isSpecialMeasureLevel(row.level)) {
        await prisma.penalty.create({
          data: {
            registrationId: row.registrationId,
            roundId: report.roundId,
            source: "INCIDENT_DECISION",
            sourceIncidentDecisionId: decision.id,
            type: "SPECIAL_MEASURE",
            pointsValue: null,
            reason: row.reason || publicSummary,
            categoryLevel: row.level,
            specialMeasure: row.specialMeasure || null,
          },
        });
        continue;
      }

      const rowPoints = pointsForLevel(scoringSystemForCat, row.level);
      await prisma.penalty.create({
        data: {
          registrationId: row.registrationId,
          roundId: report.roundId,
          source: "INCIDENT_DECISION",
          sourceIncidentDecisionId: decision.id,
          type: "POINTS_DEDUCTION",
          pointsValue: rowPoints,
          reason: row.reason || publicSummary,
          categoryLevel: row.level,
        },
      });
    }
  }

  // ---- Disqualification ------------------------------------------------
  // Apply the ticked results, revert anything this decision had DQ'd before
  // and is no longer ticked, then re-score every affected round.
  // recomputeRoundScoring ranks only the non-DSQ finishers, so the drivers
  // behind a disqualified car move up into his points automatically.
  const touchedRounds = await revertDsqForDecision(decision.id, dsqResultIds);
  for (const resultId of dsqResultIds) {
    const rr = await prisma.raceResult.findUnique({
      where: { id: resultId },
      select: {
        id: true,
        roundId: true,
        finishStatus: true,
        dsqDecisionId: true,
      },
    });
    // Guard: only results of THIS report's round can be disqualified here.
    if (!rr || rr.roundId !== report.roundId) continue;
    if (rr.dsqDecisionId === decision.id) continue; // already ours, untouched
    await prisma.raceResult.update({
      where: { id: rr.id },
      data: {
        finishStatus: "DSQ",
        dsqDecisionId: decision.id,
        // Keep the real previous status — including an existing DSQ, so
        // reverting never resurrects a driver the importer had already
        // disqualified.
        dsqPreviousStatus: rr.finishStatus,
      },
    });
    touchedRounds.add(rr.roundId);
  }
  for (const rid of touchedRounds) {
    await recomputeRoundScoring(prisma, rid);
  }

  // Penalty pool: recompute auto-forgiveness (GT3 WCT only; engine guards by slug)
  await recomputePenaltyPoolForSeason(seasonId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${report.roundId}`
  );
  revalidatePath(`/incidents`);
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
    // Undo any disqualification this decision applied BEFORE the decision row
    // disappears — afterwards nothing links the results back to it.
    const touchedRounds = await revertDsqForDecision(decision.id);
    await prisma.penalty.deleteMany({
      where: { sourceIncidentDecisionId: decision.id },
    });
    await prisma.incidentDecision.delete({
      where: { incidentReportId: reportId },
    });
    for (const rid of touchedRounds) {
      await recomputeRoundScoring(prisma, rid);
    }
  }
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "UNDER_REVIEW" },
  });
  await recomputePenaltyPoolForSeason(seasonId);
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
}

/**
 * Permanently delete an incident report (and everything attached to it).
 * Cascades remove: involvedDrivers, evidence, comments, decision.
 * Penalty rows are not cascaded by the schema, so we delete them explicitly.
 * Finally recompute the penalty pool since we may have removed pool points.
 */
export async function deleteIncidentReport(
  leagueSlug: string,
  seasonId: string,
  reportId: string
) {
  await requireSteward();

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: { decision: { select: { id: true } } },
  });
  if (!report) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  }

  const touchedRounds = new Set<string>();
  if (report.decision) {
    // Same as deleteDecision: put disqualified results back first, otherwise
    // the cascade takes the decision away and the DQ can never be undone.
    for (const rid of await revertDsqForDecision(report.decision.id)) {
      touchedRounds.add(rid);
    }
    await prisma.penalty.deleteMany({
      where: { sourceIncidentDecisionId: report.decision.id },
    });
  }

  await prisma.incidentReport.delete({ where: { id: reportId } });

  for (const rid of touchedRounds) {
    await recomputeRoundScoring(prisma, rid);
  }

  // Recompute pool (no-op outside GT3 WCT)
  await recomputePenaltyPoolForSeason(seasonId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/incidents`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
}

function evidenceKindFor(url: string): EvidenceKind {
  const lc = url.toLowerCase();
  if (lc.includes("youtu.be") || lc.includes("youtube.com")) return "YOUTUBE_LINK";
  if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(url)) return "IMAGE_URL";
  return "URL";
}

/**
 * Admin correction of a submitted report — every field the driver typed in:
 * accused drivers/teams, session, replay timestamp, lap, turn, the
 * outside-race flag, description and evidence links.
 *
 * Deliberately ADMIN-only (not stewards) and deliberately without an edit
 * trail — Thomas's call (2026-10-05).
 *
 * Never touches the verdict. If a driver who carries a penalty in this
 * report's decision is removed from the accused list, the penalty stays and
 * the case file shows a warning, so the standings never change silently.
 */
export async function updateIncidentReport(
  leagueSlug: string,
  seasonId: string,
  reportId: string,
  formData: FormData
) {
  const admin = await requireAdmin();
  const base = `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`;

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { select: { seasonId: true } },
      involvedDrivers: true,
      evidence: true,
      decision: { include: { penalties: true } },
    },
  });
  if (!report || report.round.seasonId !== seasonId) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  }

  const outsideRaceIncident = formData.get("outsideRaceIncident") === "on";
  const sessionRaw = String(formData.get("session") ?? "").trim();
  const session = sessionRaw ? (sessionRaw as RaceSession) : null;
  const replayTimestamp =
    String(formData.get("replayTimestamp") ?? "").trim() || null;
  const lapRaw = String(formData.get("lapNumber") ?? "").trim();
  const lapParsed = lapRaw ? parseInt(lapRaw, 10) : NaN;
  const lapNumber = Number.isNaN(lapParsed) ? null : lapParsed;
  const turnOrSector =
    String(formData.get("turnOrSector") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();

  if (!description) {
    redirect(`${base}?error=${encodeURIComponent("Beschreibung darf nicht leer sein.")}`);
  }
  if (!outsideRaceIncident && (!session || !replayTimestamp)) {
    redirect(
      `${base}?error=${encodeURIComponent("Session und Replay-Zeitstempel sind Pflicht (außer bei „Outside race incident“).")}`
    );
  }

  // ---- Accused -----------------------------------------------------------
  const currentAccused = report.involvedDrivers.filter(
    (d) => d.role === "ACCUSED"
  );
  const currentAccusedIds = new Set(currentAccused.map((d) => d.registrationId));
  const requested = new Set(
    formData
      .getAll("involvedRegistrationIds")
      .map((v) => String(v).trim())
      .filter(Boolean)
  );
  // The reporter can never accuse himself.
  if (report.reporterRegistrationId) requested.delete(report.reporterRegistrationId);

  // Only registrations of this season. A driver who is ALREADY accused stays
  // valid even if his registration was withdrawn since; a newly added one
  // must be approved, exactly as when filing.
  const candidateRegs = await prisma.registration.findMany({
    where: { id: { in: [...requested] }, seasonId },
    select: { id: true, status: true },
  });
  const nextAccused = new Set(
    candidateRegs
      .filter((r) => r.status === "APPROVED" || currentAccusedIds.has(r.id))
      .map((r) => r.id)
  );

  const removed = [...currentAccusedIds].filter((id) => !nextAccused.has(id));
  const added = [...nextAccused].filter((id) => !currentAccusedIds.has(id));

  await prisma.$transaction(async (tx) => {
    await tx.incidentReport.update({
      where: { id: reportId },
      data: {
        session: outsideRaceIncident ? null : session,
        replayTimestamp: outsideRaceIncident ? null : replayTimestamp,
        outsideRaceIncident,
        lapNumber,
        turnOrSector,
        description,
      },
    });

    if (removed.length > 0) {
      await tx.incidentReportInvolvedDriver.deleteMany({
        where: {
          incidentReportId: reportId,
          role: "ACCUSED",
          registrationId: { in: removed },
        },
      });
    }
    for (const regId of added) {
      // (incidentReportId, registrationId) is unique — a driver already on
      // the report as WITNESS is promoted to ACCUSED instead of duplicated.
      await tx.incidentReportInvolvedDriver.upsert({
        where: {
          incidentReportId_registrationId: {
            incidentReportId: reportId,
            registrationId: regId,
          },
        },
        update: { role: "ACCUSED" },
        create: {
          incidentReportId: reportId,
          registrationId: regId,
          role: "ACCUSED",
        },
      });
    }

    // ---- Evidence: the textarea is the full list ------------------------
    const wanted = String(formData.get("evidenceLinks") ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const wantedSet = new Set(wanted);
    const toDelete = report.evidence
      .filter((e) => !wantedSet.has(e.content))
      .map((e) => e.id);
    if (toDelete.length > 0) {
      await tx.incidentReportEvidence.deleteMany({
        where: { id: { in: toDelete } },
      });
    }
    const existing = new Set(report.evidence.map((e) => e.content));
    for (const url of [...wantedSet]) {
      if (existing.has(url)) continue;
      await tx.incidentReportEvidence.create({
        data: {
          incidentReportId: reportId,
          kind: evidenceKindFor(url),
          content: url,
          addedByUserId: admin.id,
        },
      });
    }
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  revalidatePath(base);
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/reports`);
  revalidatePath(`/incidents`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  revalidatePath(`/admin/stewards`);

  // Penalties in the existing verdict on drivers who are no longer accused:
  // keep them, but say so.
  const penalised = new Set(
    (report.decision?.penalties ?? []).map((p) => p.registrationId)
  );
  const orphaned = removed.filter((id) => penalised.has(id)).length;
  const notice =
    orphaned > 0
      ? `Meldung gespeichert. Achtung: ${orphaned} nicht mehr beschuldigte${orphaned === 1 ? "r Fahrer hat" : " Fahrer haben"} im bestehenden Urteil noch eine Strafe — bitte das Urteil prüfen.`
      : "Meldung gespeichert.";
  redirect(`${base}?notice=${encodeURIComponent(notice)}`);
}
