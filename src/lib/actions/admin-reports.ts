"use server";

import { namedTeamDrivers } from "@/lib/incident-team-form";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { teamMemberWhere } from "@/lib/team-members";
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
    /** Team mode (IEC): the team picked; null on solo leagues / old forms. */
    teamId: string | null;
    /** The driver; "" in team mode when only the team was picked. */
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
      const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
      penaltyRows = parsed
        .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
        .map((row) => ({
          teamId: str(row.teamId) || null,
          registrationId: str(row.registrationId),
          level:
            row.level === null || row.level === undefined
              ? null
              : Number(row.level),
          reason: str(row.reason),
          specialMeasure: str(row.specialMeasure),
        }))
        // A row needs a recipient: the team, or (solo) the driver.
        .filter((r) => r.teamId || r.registrationId);
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

  // Team-mode seasons (IEC): every penalty is issued to the TEAM and pinned
  // on Penalty.teamId, so a later result re-import can never move it to
  // another car. Since v2.48.0 the steward picks the team itself; naming the
  // driver is optional. Older forms send only a driver — then the team is the
  // car he sat in this round, else the team he is registered with.
  const teamMode = !!report.round.season.teamRegistration;
  type Resolved = { registrationId: string; teamId: string | null; teamOnly: boolean };
  const resolved: (Resolved & PenaltyRowInput)[] = [];
  if (teamMode && rowsToSave.length > 0) {
    const teamIds = [...new Set(rowsToSave.map((r) => r.teamId).filter((x): x is string => !!x))];
    const regIds = [...new Set(rowsToSave.map((r) => r.registrationId).filter(Boolean))];
    const [seasonTeams, regs, drove, crews] = await Promise.all([
      prisma.team.findMany({
        where: { id: { in: teamIds }, seasonId: report.round.seasonId },
        select: { id: true, leaderUserId: true },
      }),
      prisma.registration.findMany({
        where: { id: { in: regIds } },
        select: { id: true, teamId: true },
      }),
      prisma.teamRoundDriver.findMany({
        where: { registrationId: { in: regIds }, teamResult: { roundId: report.roundId } },
        select: { registrationId: true, teamResult: { select: { teamId: true } } },
      }),
      // Placeholder driver for a team-only penalty: whoever drove the most
      // laps in that car this round.
      prisma.teamRoundDriver.findMany({
        where: { teamResult: { roundId: report.roundId, teamId: { in: teamIds } } },
        select: { registrationId: true, lapsCompleted: true, teamResult: { select: { teamId: true } } },
        orderBy: { lapsCompleted: "desc" },
      }),
    ]);
    const validTeams = new Set(seasonTeams.map((t) => t.id));
    const teamOfReg = new Map<string, string>();
    for (const r of regs) if (r.teamId) teamOfReg.set(r.id, r.teamId);
    for (const d of drove) teamOfReg.set(d.registrationId, d.teamResult.teamId);

    const placeholder = async (teamId: string): Promise<string | null> => {
      const fromCrew = crews.find((c) => c.teamResult.teamId === teamId);
      if (fromCrew) return fromCrew.registrationId;
      // No results yet: the Teamchef if he drives, else the longest-entered
      // active driver.
      const leaderUserId = seasonTeams.find((t) => t.id === teamId)?.leaderUserId;
      const members = await prisma.registration.findMany({
        where: {
          ...teamMemberWhere(teamId),
          seasonId: report.round.seasonId,
          isTeamManager: false,
          status: { not: "WITHDRAWN" },
        },
        orderBy: { createdAt: "asc" },
        select: { id: true, userId: true },
      });
      return (members.find((m) => m.userId === leaderUserId) ?? members[0])?.id ?? null;
    };

    for (const row of rowsToSave) {
      if (row.teamId) {
        if (!validTeams.has(row.teamId)) continue;
        const regId = row.registrationId || (await placeholder(row.teamId));
        if (!regId) continue; // a team with no driver at all can't hold a row
        resolved.push({ ...row, registrationId: regId, teamId: row.teamId, teamOnly: !row.registrationId });
      } else if (row.registrationId) {
        resolved.push({ ...row, teamId: teamOfReg.get(row.registrationId) ?? null, teamOnly: false });
      }
    }
  } else {
    for (const row of rowsToSave) {
      if (row.registrationId) resolved.push({ ...row, teamId: null, teamOnly: false });
    }
  }

  if (resolved.length > 0) {
    // One penalty per recipient; de-dupe in case the same one was picked
    // twice (team mode: the same team, solo: the same driver).
    const seen = new Set<string>();
    for (const row of resolved) {
      const key = teamMode && row.teamId ? `t:${row.teamId}` : `r:${row.registrationId}`;
      if (seen.has(key)) continue;
      seen.add(key);

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
            teamId: row.teamId,
            teamOnly: row.teamOnly,
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
          teamId: row.teamId,
          teamOnly: row.teamOnly,
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
      involvedTeams: true,
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
    // Team-mode form (IEC): the ticked cars are the full accused-team list.
    // Only synced when the team picker was on the form, so a solo-league edit
    // never touches it.
    if (formData.get("teamPickerOnForm") === "1") {
      const wantedTeams = [
        ...new Set(
          formData
            .getAll("involvedTeamIds")
            .map((v) => String(v).trim())
            .filter(Boolean)
        ),
      ];
      const validTeams = await tx.team.findMany({
        where: { id: { in: wantedTeams }, seasonId },
        select: { id: true },
      });
      const keep = new Set(validTeams.map((t) => t.id));
      const named = await namedTeamDrivers(formData, seasonId, [...keep]);
      await tx.incidentReportInvolvedTeam.deleteMany({
        where: { incidentReportId: reportId, teamId: { notIn: [...keep] } },
      });
      for (const teamId of keep) {
        await tx.incidentReportInvolvedTeam.upsert({
          where: { incidentReportId_teamId: { incidentReportId: reportId, teamId } },
          update: { registrationId: named.get(teamId) ?? null },
          create: {
            incidentReportId: reportId,
            teamId,
            role: "ACCUSED",
            registrationId: named.get(teamId) ?? null,
          },
        });
      }
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
