#!/usr/bin/env bash
# Week 4 Phase 2 — CSV upload + season standings (driver + Pro/Am + team)
#
# Usage:
#   bash week4-phase2-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Week 4 Phase 2 — CSV import + standings"
echo "============================================="

ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Standings calculation library
# ------------------------------------------------------------
echo ">>> Writing standings library..."

cat > src/lib/standings.ts <<'EOF'
import type { PrismaClient } from "@prisma/client";

export interface DriverStanding {
  registrationId: string;
  startNumber: number | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  teamId: string | null;
  teamName: string | null;
  carClassId: string | null;
  carClassName: string | null;
  proAmClass: "PRO" | "AM" | null;
  totalPoints: number;
  rawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  roundsCompleted: number;
}

export interface TeamStanding {
  teamId: string;
  teamName: string;
  totalPoints: number;
  scoringPoints: number;
  fprPoints: number;
  bestN: number;
  driversCount: number;
}

export async function computeDriverStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<DriverStanding[]> {
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      raceResults: true,
    },
  });

  const standings: DriverStanding[] = registrations.map((reg) => {
    let raw = 0;
    let participation = 0;
    let penalty = 0;
    for (const r of reg.raceResults) {
      raw += r.rawPointsAwarded;
      participation += r.participationPointsAwarded;
      penalty += r.manualPenaltyPoints;
    }
    return {
      registrationId: reg.id,
      startNumber: reg.startNumber,
      driverFirstName: reg.user.firstName,
      driverLastName: reg.user.lastName,
      teamId: reg.teamId,
      teamName: reg.team?.name ?? null,
      carClassId: reg.carClassId,
      carClassName: reg.carClass?.name ?? null,
      proAmClass: reg.proAmClass as "PRO" | "AM" | null,
      totalPoints: raw + participation - penalty,
      rawPoints: raw,
      participationPoints: participation,
      manualPenalties: penalty,
      roundsCompleted: reg.raceResults.length,
    };
  });

  standings.sort(
    (a, b) =>
      b.totalPoints - a.totalPoints ||
      b.rawPoints - a.rawPoints ||
      b.roundsCompleted - a.roundsCompleted ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
  );

  return standings;
}

export async function computeTeamStandings(
  prisma: PrismaClient,
  seasonId: string
): Promise<TeamStanding[]> {
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { teams: true },
  });
  if (!season || season.teamScoringMode === "NONE") return [];

  const bestN =
    season.teamScoringMode === "SUM_BEST_N"
      ? season.teamScoringBestN ?? 2
      : Number.POSITIVE_INFINITY;

  const rounds = await prisma.round.findMany({
    where: { seasonId },
    include: {
      raceResults: {
        include: {
          registration: { select: { teamId: true } },
        },
      },
      fprAwards: true,
    },
  });

  // Initialize team counters
  const teamMap = new Map<
    string,
    {
      team: { id: string; name: string };
      scoringPoints: number;
      fprPoints: number;
      driverIds: Set<string>;
    }
  >();

  for (const t of season.teams) {
    teamMap.set(t.id, {
      team: { id: t.id, name: t.name },
      scoringPoints: 0,
      fprPoints: 0,
      driverIds: new Set(),
    });
  }

  for (const round of rounds) {
    // Group results by team for this round
    const byTeam = new Map<string, number[]>();
    for (const r of round.raceResults) {
      const teamId = r.registration.teamId;
      if (!teamId) continue;
      const points =
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints;
      if (!byTeam.has(teamId)) byTeam.set(teamId, []);
      byTeam.get(teamId)!.push(points);
    }

    for (const [teamId, pointsList] of byTeam) {
      const sorted = [...pointsList].sort((a, b) => b - a);
      const taken = Number.isFinite(bestN)
        ? sorted.slice(0, bestN as number)
        : sorted;
      const sum = taken.reduce((s, p) => s + p, 0);
      const t = teamMap.get(teamId);
      if (t) t.scoringPoints += sum;
    }

    for (const award of round.fprAwards) {
      const t = teamMap.get(award.teamId);
      if (t) t.fprPoints += award.fprPointsAwarded;
    }
  }

  // Count distinct drivers per team
  const regs = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED", teamId: { not: null } },
    select: { teamId: true, userId: true },
  });
  for (const r of regs) {
    if (!r.teamId) continue;
    const t = teamMap.get(r.teamId);
    if (t) t.driverIds.add(r.userId);
  }

  const standings: TeamStanding[] = Array.from(teamMap.values())
    .map((t) => ({
      teamId: t.team.id,
      teamName: t.team.name,
      scoringPoints: t.scoringPoints,
      fprPoints: t.fprPoints,
      totalPoints: t.scoringPoints + t.fprPoints,
      bestN: Number.isFinite(bestN) ? (bestN as number) : 0,
      driversCount: t.driverIds.size,
    }))
    .sort(
      (a, b) =>
        b.totalPoints - a.totalPoints ||
        b.scoringPoints - a.scoringPoints ||
        a.teamName.localeCompare(b.teamName)
    );

  return standings;
}
EOF

# ------------------------------------------------------------
# 2. CSV import server action
# ------------------------------------------------------------
echo ">>> Writing CSV import action..."

cat > src/lib/actions/csv-import.ts <<'EOF'
"use server";

import Papa from "papaparse";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import { parseTimeToMs } from "@/lib/time";
import type { FinishStatus } from "@prisma/client";

interface IRacingRow {
  [key: string]: string | undefined;
}

function findHeader(
  headers: string[],
  variants: string[]
): string | null {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const headerNorm = headers.map(norm);
  for (const v of variants) {
    const i = headerNorm.indexOf(norm(v));
    if (i >= 0) return headers[i];
  }
  return null;
}

export async function importResultsCsv(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  const admin = await requireAdmin();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=No+file+selected`
    );
  }

  const text = await file.text();
  const parsed = Papa.parse<IRacingRow>(text, {
    header: true,
    skipEmptyLines: true,
  });

  if (!parsed.meta.fields || parsed.meta.fields.length === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=Could+not+read+CSV+headers`
    );
  }

  const fields = parsed.meta.fields;
  const colCustID = findHeader(fields, [
    "custid",
    "customerid",
    "memberid",
    "iracingmemberid",
    "irid",
  ]);
  const colPos = findHeader(fields, [
    "pos",
    "finishposition",
    "finishpos",
    "position",
    "finishingposition",
  ]);
  const colLaps = findHeader(fields, [
    "lapsdone",
    "laps",
    "lapscompleted",
    "lapscomplete",
  ]);
  const colInc = findHeader(fields, ["inc", "incidents", "incs"]);
  const colTotalTime = findHeader(fields, [
    "totaltime",
    "racetime",
    "interval",
  ]);
  const colBestTime = findHeader(fields, [
    "bestlaptime",
    "fastestlap",
    "besttime",
    "bestlap",
  ]);
  const colOut = findHeader(fields, [
    "out",
    "reasonout",
    "dnfreason",
    "status",
    "outcome",
  ]);

  if (!colCustID || !colPos) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import?error=CSV+missing+required+columns+(CustID+and+Pos+required)`
    );
  }

  // Compute max laps for raceDistancePct
  let maxLaps = 0;
  if (colLaps) {
    for (const row of parsed.data) {
      const l = parseInt(row[colLaps] ?? "0", 10) || 0;
      if (l > maxLaps) maxLaps = l;
    }
  }

  let imported = 0;
  let skipped = 0;
  const errors: Array<{ row: number; reason: string }> = [];

  for (let i = 0; i < parsed.data.length; i++) {
    const row = parsed.data[i];
    const custIdRaw = String(row[colCustID] ?? "").trim();
    if (!custIdRaw) {
      skipped++;
      errors.push({ row: i + 2, reason: "CustID is empty" });
      continue;
    }
    const custId = custIdRaw.replace(/[^0-9]/g, "");

    const reg = await prisma.registration.findFirst({
      where: {
        seasonId,
        status: "APPROVED",
        user: { iracingMemberId: custId },
      },
    });

    if (!reg) {
      skipped++;
      errors.push({
        row: i + 2,
        reason: `No approved registration for iRacing ID ${custId}`,
      });
      continue;
    }

    const finishPosition = parseInt(row[colPos] ?? "0", 10) || 0;
    const lapsCompleted = colLaps
      ? parseInt(row[colLaps] ?? "0", 10) || 0
      : 0;
    const raceDistancePct =
      maxLaps > 0 ? Math.round((lapsCompleted / maxLaps) * 100) : 100;
    const totalTimeMs = colTotalTime
      ? parseTimeToMs(row[colTotalTime])
      : null;
    const bestLapTimeMs = colBestTime
      ? parseTimeToMs(row[colBestTime])
      : null;
    const incidents = colInc
      ? parseInt(row[colInc] ?? "0", 10) || 0
      : 0;
    const outReason = colOut ? String(row[colOut] ?? "").trim() : "";

    let finishStatus: FinishStatus = "CLASSIFIED";
    if (outReason) {
      const lc = outReason.toLowerCase();
      if (lc.includes("disq") || lc.includes("dsq")) finishStatus = "DSQ";
      else if (lc.includes("dns") || lc.includes("did not start"))
        finishStatus = "DNS";
      else finishStatus = "DNF";
    }

    await prisma.raceResult.upsert({
      where: {
        roundId_registrationId: { roundId, registrationId: reg.id },
      },
      create: {
        roundId,
        registrationId: reg.id,
        finishStatus,
        finishPosition,
        lapsCompleted,
        raceDistancePct,
        totalTimeMs,
        bestLapTimeMs,
        incidents,
      },
      update: {
        finishStatus,
        finishPosition,
        lapsCompleted,
        raceDistancePct,
        totalTimeMs,
        bestLapTimeMs,
        incidents,
      },
    });
    imported++;
  }

  await prisma.csvImport.create({
    data: {
      roundId,
      uploadedById: admin.id,
      originalFilename: file.name,
      rowsImported: imported,
      rowsSkipped: skipped,
      errorLog: errors.length > 0 ? (errors as object) : undefined,
    },
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );

  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?imported=${imported}&skipped=${skipped}`
  );
}
EOF

# ------------------------------------------------------------
# 3. CSV import upload page
# ------------------------------------------------------------
echo ">>> Writing CSV import page..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { importResultsCsv } from "@/lib/actions/csv-import";

export default async function ImportCsvPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { error } = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      csvImports: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true, email: true } } },
        take: 5,
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const action = importResultsCsv.bind(null, slug, seasonId, roundId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import results from CSV</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Round {round.roundNumber} — {round.name}
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Upload the CSV file exported from iRacing&apos;s league session
          results page. The parser detects column names automatically and
          matches each row to a registered driver by their{" "}
          <strong className="text-zinc-200">iRacing CustID</strong>.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Required columns:{" "}
          <code className="rounded bg-zinc-800 px-1">CustID</code> and{" "}
          <code className="rounded bg-zinc-800 px-1">Pos</code>. Optional:
          Laps, Inc, Total Time, Best Time, Out / Reason Out.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Importing twice for the same round is safe — existing results for
          each driver are updated rather than duplicated.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">CSV file</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Upload and import
        </button>
      </form>

      {round.csvImports.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-right">Imported</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {round.csvImports.map((imp) => (
                  <tr key={imp.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 text-zinc-400">
                      {new Date(imp.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {imp.uploadedBy.name ?? imp.uploadedBy.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {imp.originalFilename}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">
                      {imp.rowsImported}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-400">
                      {imp.rowsSkipped}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 4. Add import banner + import link to admin round page
# ------------------------------------------------------------
echo ">>> Updating admin round results page with Import CSV link..."

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { upsertRaceResult } from "@/lib/actions/race-results";
import { formatMsToTime } from "@/lib/time";

export default async function AdminRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ imported?: string; skipped?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { imported, skipped } = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: { league: true, scoringSystem: true },
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      raceResults: { where: { roundId } },
    },
    orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {round.season.name} {round.season.year}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Round {round.roundNumber} — {round.name}
            </h1>
            <p className="text-sm text-zinc-400">
              {round.track}
              {round.trackConfig ? ` (${round.trackConfig})` : ""} •{" "}
              {new Date(round.startsAt).toLocaleString()} •{" "}
              {round.status.replace("_", " ")}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/import`}
              className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Import CSV
            </Link>
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/edit`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Edit round
            </Link>
          </div>
        </div>
      </div>

      {imported && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Imported {imported} row{imported === "1" ? "" : "s"}
          {skipped && Number(skipped) > 0
            ? `, skipped ${skipped} (likely no matching iRacing ID in roster)`
            : ""}
          .
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Scoring:{" "}
          <strong className="text-zinc-200">
            {round.season.scoringSystem.name}
          </strong>
          {" • "}
          Participation: {round.season.scoringSystem.participationPoints}{" "}
          points if ≥ {round.season.scoringSystem.participationMinDistancePct}%
          of race distance.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Points are recalculated automatically after each save or CSV import.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Results — {registrations.length} approved driver
          {registrations.length === 1 ? "" : "s"}
        </h2>

        {registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No approved drivers yet. Approve registrations on the Roster tab
            first.
          </p>
        ) : (
          <div className="space-y-3">
            {registrations.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={round.season.isMulticlass}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResultRow({
  slug,
  seasonId,
  roundId,
  reg,
  isMulticlass,
}: {
  slug: string;
  seasonId: string;
  roundId: string;
  reg: {
    id: string;
    startNumber: number | null;
    user: { firstName: string | null; lastName: string | null };
    team: { name: string } | null;
    carClass: { name: string } | null;
    raceResults: Array<{
      id: string;
      finishPosition: number;
      lapsCompleted: number;
      raceDistancePct: number;
      totalTimeMs: number | null;
      bestLapTimeMs: number | null;
      incidents: number;
      finishStatus: string;
      rawPointsAwarded: number;
      participationPointsAwarded: number;
      manualPenaltyPoints: number;
      manualPenaltyReason: string | null;
      notes: string | null;
    }>;
  };
  isMulticlass: boolean;
}) {
  const result = reg.raceResults[0];
  const action = upsertRaceResult.bind(null, slug, seasonId, roundId, reg.id);

  const totalPoints = result
    ? result.rawPointsAwarded +
      result.participationPointsAwarded -
      result.manualPenaltyPoints
    : 0;

  return (
    <form
      action={action}
      className="rounded border border-zinc-800 bg-zinc-900 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-semibold">
            {reg.startNumber != null && (
              <span className="mr-2 text-zinc-500">#{reg.startNumber}</span>
            )}
            {reg.user.firstName} {reg.user.lastName}
          </span>
          <span className="ml-3 text-xs text-zinc-500">
            {reg.team?.name ?? "Independent"}
            {isMulticlass && reg.carClass && ` • ${reg.carClass.name}`}
          </span>
        </div>
        {result && (
          <div className="text-xs text-zinc-400">
            Points:{" "}
            <span className="font-bold text-orange-400">{totalPoints}</span>
            <span className="ml-1 text-zinc-600">
              ({result.rawPointsAwarded}+{result.participationPointsAwarded}
              {result.manualPenaltyPoints > 0 &&
                `−${result.manualPenaltyPoints}`}
              )
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Field
          label="Finish status"
          name="finishStatus"
          type="select"
          defaultValue={result?.finishStatus ?? "CLASSIFIED"}
          options={["CLASSIFIED", "DNF", "DNS", "DSQ"]}
        />
        <Field
          label="Position"
          name="finishPosition"
          type="number"
          defaultValue={String(result?.finishPosition ?? "")}
          min={0}
          max={999}
        />
        <Field
          label="Laps"
          name="lapsCompleted"
          type="number"
          defaultValue={String(result?.lapsCompleted ?? 0)}
          min={0}
        />
        <Field
          label="Distance %"
          name="raceDistancePct"
          type="number"
          defaultValue={String(result?.raceDistancePct ?? 100)}
          min={0}
          max={100}
        />
        <Field
          label="Incidents"
          name="incidents"
          type="number"
          defaultValue={String(result?.incidents ?? 0)}
          min={0}
        />
        <Field
          label="Total time"
          name="totalTime"
          type="text"
          defaultValue={formatMsToTime(result?.totalTimeMs)}
          placeholder="1:23:45.678"
        />
        <Field
          label="Best lap"
          name="bestLapTime"
          type="text"
          defaultValue={formatMsToTime(result?.bestLapTimeMs)}
          placeholder="1:53.456"
        />
        <Field
          label="Penalty pts"
          name="manualPenaltyPoints"
          type="number"
          defaultValue={String(result?.manualPenaltyPoints ?? 0)}
          min={0}
        />
        <Field
          label="Penalty reason"
          name="manualPenaltyReason"
          type="text"
          defaultValue={result?.manualPenaltyReason ?? ""}
          placeholder="e.g. unsafe rejoin T3"
          wide
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Save row
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  options,
  min,
  max,
  wide,
}: {
  label: string;
  name: string;
  type?: "text" | "number" | "select";
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  wide?: boolean;
}) {
  return (
    <label
      className={`block ${wide ? "col-span-2 md:col-span-3 lg:col-span-3" : ""}`}
    >
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {type === "select" && options ? (
        <select
          name={name}
          defaultValue={defaultValue}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          min={min}
          max={max}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
      )}
    </label>
  );
}
EOF

# ------------------------------------------------------------
# 5. Public season standings page
# ------------------------------------------------------------
echo ">>> Writing public season standings page..."
ensure_dir 'src/app/leagues/[slug]/seasons/[seasonId]/standings'

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  computeDriverStandings,
  computeTeamStandings,
  type DriverStanding,
  type TeamStanding,
} from "@/lib/standings";

export default async function StandingsPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      scoringSystem: true,
      carClasses: { orderBy: { displayOrder: "asc" } },
    },
  });
  if (!season || season.league.slug !== slug) notFound();

  const [drivers, teams] = await Promise.all([
    computeDriverStandings(prisma, seasonId),
    computeTeamStandings(prisma, seasonId),
  ]);

  const proDrivers = drivers.filter((d) => d.proAmClass === "PRO");
  const amDrivers = drivers.filter((d) => d.proAmClass === "AM");

  return (
    <div className="space-y-8">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">
          Standings — {season.name} {season.year}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.name}
          {season.proAmEnabled && " • Pro/Am"}
          {season.isMulticlass && " • Multiclass"}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Driver Championship</h2>
        <DriversTable
          rows={drivers}
          showTeam
          showClass={season.isMulticlass}
        />
      </section>

      {season.proAmEnabled && (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Pro</h2>
            <DriversTable rows={proDrivers} showTeam />
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Am</h2>
            <DriversTable rows={amDrivers} showTeam />
          </section>
        </>
      )}

      {season.isMulticlass && season.carClasses.length > 0 && (
        <>
          {season.carClasses.map((cc) => (
            <section key={cc.id}>
              <h2 className="mb-3 text-lg font-semibold">{cc.name}</h2>
              <DriversTable
                rows={drivers.filter((d) => d.carClassId === cc.id)}
                showTeam
              />
            </section>
          ))}
        </>
      )}

      {teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {season.teamScoringMode === "SUM_BEST_N"
              ? `Best ${season.teamScoringBestN ?? 2} drivers per round`
              : "Sum of all team drivers' points"}
            {teams.some((t) => t.fprPoints > 0) && " + Fair Play Rating awards"}
          </p>
          <TeamsTable rows={teams} />
        </section>
      )}
    </div>
  );
}

function DriversTable({
  rows,
  showTeam,
  showClass,
}: {
  rows: DriverStanding[];
  showTeam?: boolean;
  showClass?: boolean;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-zinc-500">No standings to show yet.</p>
    );
  }
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Driver</th>
            {showTeam && <th className="px-3 py-2">Team</th>}
            {showClass && <th className="px-3 py-2">Class</th>}
            <th className="px-3 py-2 text-right">Rounds</th>
            <th className="px-3 py-2 text-right">Raw</th>
            <th className="px-3 py-2 text-right">Part.</th>
            <th className="px-3 py-2 text-right">Pen.</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.registrationId}
              className="border-t border-zinc-800 hover:bg-zinc-900"
            >
              <td className="px-3 py-2 font-medium">{idx + 1}</td>
              <td className="px-3 py-2 text-zinc-500">
                {r.startNumber ?? "—"}
              </td>
              <td className="px-3 py-2 font-medium">
                {r.driverFirstName} {r.driverLastName}
              </td>
              {showTeam && (
                <td className="px-3 py-2 text-zinc-400">
                  {r.teamName ?? "—"}
                </td>
              )}
              {showClass && (
                <td className="px-3 py-2 text-zinc-400">
                  {r.carClassName ?? "—"}
                </td>
              )}
              <td className="px-3 py-2 text-right text-zinc-400">
                {r.roundsCompleted}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                {r.rawPoints}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                {r.participationPoints}
              </td>
              <td className="px-3 py-2 text-right text-red-400 tabular-nums">
                {r.manualPenalties > 0 ? `−${r.manualPenalties}` : 0}
              </td>
              <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums">
                {r.totalPoints}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TeamsTable({ rows }: { rows: TeamStanding[] }) {
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Team</th>
            <th className="px-3 py-2 text-right">Drivers</th>
            <th className="px-3 py-2 text-right">Race pts</th>
            <th className="px-3 py-2 text-right">FPR</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr
              key={r.teamId}
              className="border-t border-zinc-800 hover:bg-zinc-900"
            >
              <td className="px-3 py-2 font-medium">{idx + 1}</td>
              <td className="px-3 py-2 font-medium">{r.teamName}</td>
              <td className="px-3 py-2 text-right text-zinc-400">
                {r.driversCount}
              </td>
              <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                {r.scoringPoints}
              </td>
              <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">
                {r.fprPoints > 0 ? `+${r.fprPoints}` : 0}
              </td>
              <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums">
                {r.totalPoints}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 6. Update public season page with Standings link
# ------------------------------------------------------------
echo ">>> Adding Standings link to public season detail..."

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicSeasonDetail({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      scoringSystem: true,
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { _count: { select: { raceResults: true } } },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: { user: true, team: true, carClass: true },
        orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const registrationOpen =
    season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE";
  const hasResults = season.rounds.some((r) => r._count.raceResults > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {season.name} {season.year}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {season.scoringSystem.name} • {season.status.replace("_", " ")}
              {season.isMulticlass && " • Multiclass"}
              {season.proAmEnabled && " • Pro/Am"}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasResults && (
              <Link
                href={`/leagues/${slug}/seasons/${seasonId}/standings`}
                className="rounded border border-orange-500 px-4 py-2 text-sm font-medium text-orange-400 hover:bg-orange-500/10"
              >
                Standings →
              </Link>
            )}
            {registrationOpen && (
              <Link
                href={`/leagues/${slug}/seasons/${seasonId}/register`}
                className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              >
                Register for this season →
              </Link>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race calendar</h2>
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rd</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 text-zinc-500">{r.roundNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                      className="hover:text-orange-400"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(r.startsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">
                    {r._count.raceResults > 0 ? (
                      <Link
                        href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-orange-400 hover:underline"
                      >
                        Results →
                      </Link>
                    ) : (
                      <span className="text-xs">No results</span>
                    )}
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No rounds scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved drivers yet.</p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Team</th>
                  {season.isMulticlass && <th className="px-4 py-3">Class</th>}
                  {season.proAmEnabled && <th className="px-4 py-3">Pro/Am</th>}
                </tr>
              </thead>
              <tbody>
                {season.registrations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-zinc-500">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.team?.name ?? "—"}
                    </td>
                    {season.isMulticlass && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {season.proAmEnabled && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.proAmClass ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "Phase 4.2 files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo ""
echo "2. Verify:"
echo "   a) Admin → round results → click 'Import CSV' → upload an iRacing"
echo "      session export. The parser auto-detects column names; results"
echo "      should populate for any drivers whose iRacing IDs match the roster."
echo "   b) Public season page → 'Standings →' button (visible once any round"
echo "      has results) → see Driver Championship, Pro/Am split if enabled,"
echo "      per-class tables if multiclass, and Team Championship with FPR."
echo ""
echo "3. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 4 Phase 2: CSV import + season standings'"
echo "   git push"
echo ""
