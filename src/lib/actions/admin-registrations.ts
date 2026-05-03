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

const ADMIN_CHECK_FIELDS = new Set([
  "startingFeePaid",
  "iracingInvitationSent",
  "iracingInvitationAccepted",
]);

const ADMIN_CHECK_VALUES = new Set(["PENDING", "YES", "NO"]);

export async function updateRegistrationFlag(formData: FormData) {
  await requireAdmin();
  const registrationId = String(formData.get("registrationId") ?? "");
  const field = String(formData.get("field") ?? "");
  const value = String(formData.get("value") ?? "");

  if (!registrationId) throw new Error("registrationId required");
  if (!ADMIN_CHECK_FIELDS.has(field)) throw new Error("Invalid field");
  if (!ADMIN_CHECK_VALUES.has(value)) throw new Error("Invalid value");

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    // The field name is whitelisted above; cast is necessary because the key
    // is a runtime string here.
    data: { [field]: value } as never,
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}

const PROAM_VALUES = new Set(["PRO", "AM", "AUTO"]);

export async function setRegistrationProAmClass(formData: FormData) {
  await requireAdmin();
  const registrationId = String(formData.get("registrationId") ?? "");
  const value = String(formData.get("value") ?? "");
  if (!registrationId) throw new Error("registrationId required");
  if (!PROAM_VALUES.has(value)) throw new Error("Invalid value");

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: { proAmClass: value === "AUTO" ? null : (value as "PRO" | "AM") },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/pro-am`
  );
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}

export async function applyProAmToTargetSeason(formData: FormData) {
  await requireAdmin();
  const sourceSeasonId = String(formData.get("sourceSeasonId") ?? "");
  const targetSeasonId = String(formData.get("targetSeasonId") ?? "");

  if (!sourceSeasonId || !targetSeasonId)
    throw new Error("Both source and target season IDs required");
  if (sourceSeasonId === targetSeasonId)
    throw new Error("Target must be different from source");

  const [source, target] = await Promise.all([
    prisma.season.findUnique({
      where: { id: sourceSeasonId },
      include: {
        league: true,
        rounds: { where: { countsForChampionship: true } },
        registrations: {
          where: { status: "APPROVED" },
          include: { raceResults: true },
        },
      },
    }),
    prisma.season.findUnique({
      where: { id: targetSeasonId },
      include: {
        league: true,
        registrations: { where: { status: "APPROVED" } },
      },
    }),
  ]);

  if (!source) throw new Error("Source season not found");
  if (!target) throw new Error("Target season not found");
  if (source.leagueId !== target.leagueId)
    throw new Error("Target must be in the same league");

  // Recompute the Pro/Am classification (same algorithm as the page).
  const totalRounds = source.rounds.length;
  const minStarts = Math.ceil(totalRounds / 2);
  const dropWorst = Math.floor(totalRounds / 4);
  const keepN = Math.max(1, totalRounds - dropWorst);
  const proPercent = 0.3;

  type Row = {
    registrationId: string;
    userId: string;
    storedProAmClass: "PRO" | "AM" | null;
    starts: number;
    adjustedAvg: number | null;
    avgIncidents: number;
    eligible: boolean;
  };

  const rows: Row[] = source.registrations.map((reg) => {
    const pointsByRound = new Map<string, number>();
    const incByRound = new Map<string, number>();
    for (const rr of reg.raceResults) {
      const pts =
        rr.rawPointsAwarded +
        rr.participationPointsAwarded -
        rr.manualPenaltyPoints +
        rr.correctionPoints;
      pointsByRound.set(rr.roundId, (pointsByRound.get(rr.roundId) ?? 0) + pts);
      incByRound.set(
        rr.roundId,
        (incByRound.get(rr.roundId) ?? 0) + rr.incidents
      );
    }
    const roundPoints = [...pointsByRound.values()];
    const roundIncidents = [...incByRound.values()];
    const starts = roundPoints.length;
    const eligible = starts >= minStarts;
    let adjustedAvg: number | null = null;
    if (eligible) {
      const sorted = [...roundPoints].sort((a, b) => b - a);
      const keep = sorted.slice(0, Math.min(keepN, sorted.length));
      adjustedAvg = keep.reduce((a, b) => a + b, 0) / keep.length;
    }
    const avgIncidents =
      starts > 0
        ? roundIncidents.reduce((a, b) => a + b, 0) / starts
        : 0;
    return {
      registrationId: reg.id,
      userId: reg.userId,
      storedProAmClass:
        (reg as { proAmClass: "PRO" | "AM" | null }).proAmClass ?? null,
      starts,
      adjustedAvg,
      avgIncidents,
      eligible,
    };
  });

  const eligibleSorted = rows
    .filter((r) => r.eligible)
    .sort((a, b) => {
      const aa = a.adjustedAvg ?? -Infinity;
      const bb = b.adjustedAvg ?? -Infinity;
      if (bb !== aa) return bb - aa;
      return a.avgIncidents - b.avgIncidents;
    });
  const proCount = Math.ceil(eligibleSorted.length * proPercent);
  const proRegIds = new Set(
    eligibleSorted.slice(0, proCount).map((r) => r.registrationId)
  );

  // Final class per source userId. Override (storedProAmClass) wins;
  // otherwise: Pro if eligible & in top 30%, Am if eligible & not, null if not eligible.
  const finalByUserId = new Map<string, "PRO" | "AM" | null>();
  for (const row of rows) {
    let cls: "PRO" | "AM" | null;
    if (row.storedProAmClass) cls = row.storedProAmClass;
    else if (!row.eligible) cls = null;
    else cls = proRegIds.has(row.registrationId) ? "PRO" : "AM";
    finalByUserId.set(row.userId, cls);
  }

  let appliedPro = 0;
  let appliedAm = 0;
  let appliedAuto = 0;
  let skipped = 0;

  for (const targetReg of target.registrations) {
    if (!finalByUserId.has(targetReg.userId)) {
      skipped++;
      continue;
    }
    const cls = finalByUserId.get(targetReg.userId) ?? null;
    await prisma.registration.update({
      where: { id: targetReg.id },
      data: { proAmClass: cls },
    });
    if (cls === "PRO") appliedPro++;
    else if (cls === "AM") appliedAm++;
    else appliedAuto++;
  }

  revalidatePath(
    `/admin/leagues/${source.league.slug}/seasons/${sourceSeasonId}/pro-am`
  );
  revalidatePath(
    `/admin/leagues/${source.league.slug}/seasons/${targetSeasonId}/roster`
  );

  const targetLabel = `${target.name} ${target.year}`;
  redirect(
    `/admin/leagues/${source.league.slug}/seasons/${sourceSeasonId}/pro-am?appliedPro=${appliedPro}&appliedAm=${appliedAm}&appliedAuto=${appliedAuto}&skipped=${skipped}&target=${encodeURIComponent(targetLabel)}`
  );
}

