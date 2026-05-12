#!/usr/bin/env bash
# Week 4 Phase 1 — Manual results entry + scoring engine + public race results
# Adds the per-round results editor, the scoring library (raw + participation
# points, FPR computation), and a public race results page.
#
# Usage:
#   bash week4-phase1-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Week 4 Phase 1 — Results entry + scoring"
echo "============================================="

ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Time formatting helpers
# ------------------------------------------------------------
echo ">>> Writing time helpers..."

cat > src/lib/time.ts <<'EOF'
/**
 * Parse a time string into milliseconds.
 * Accepts:
 *   - "63.456"       → 63456
 *   - "1:03.456"     → 63456
 *   - "1:23:45.678"  → 5025678
 *   - empty / null   → null
 */
export function parseTimeToMs(input: string | null | undefined): number | null {
  if (input == null) return null;
  const t = input.trim();
  if (!t) return null;

  const parts = t.split(":");
  let seconds = 0;

  if (parts.length === 1) {
    seconds = parseFloat(parts[0]);
  } else if (parts.length === 2) {
    const m = parseInt(parts[0], 10);
    const s = parseFloat(parts[1]);
    if (Number.isNaN(m) || Number.isNaN(s)) return null;
    seconds = m * 60 + s;
  } else if (parts.length === 3) {
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseFloat(parts[2]);
    if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
    seconds = h * 3600 + m * 60 + s;
  } else {
    return null;
  }

  if (Number.isNaN(seconds)) return null;
  return Math.round(seconds * 1000);
}

/**
 * Format milliseconds to "M:SS.mmm" (or "H:MM:SS.mmm" if >= 1 hour).
 * Returns "" for null/undefined.
 */
export function formatMsToTime(
  ms: number | null | undefined
): string {
  if (ms == null) return "";

  const totalSec = ms / 1000;
  const hh = Math.floor(totalSec / 3600);
  const mm = Math.floor((totalSec % 3600) / 60);
  const ss = totalSec % 60;
  const ssStr = ss.toFixed(3).padStart(6, "0");

  if (hh > 0) {
    return `${hh}:${String(mm).padStart(2, "0")}:${ssStr}`;
  }
  return `${mm}:${ssStr}`;
}
EOF

# ------------------------------------------------------------
# 2. Scoring engine
# ------------------------------------------------------------
echo ">>> Writing scoring engine..."

cat > src/lib/scoring.ts <<'EOF'
import type {
  PrismaClient,
  FinishStatus,
  ScoringSystem,
} from "@prisma/client";

export interface PointsTable {
  [position: string]: number;
}

export interface FPRTier {
  max: number;
  points: number;
}

/**
 * Position points based on finish position and finish status.
 * Only CLASSIFIED finishes earn position points.
 */
export function calculateRawPoints(
  finishPosition: number,
  finishStatus: FinishStatus,
  pointsTable: PointsTable
): number {
  if (finishStatus !== "CLASSIFIED") return 0;
  if (finishPosition < 1) return 0;
  return pointsTable[String(finishPosition)] ?? 0;
}

/**
 * Participation points if driver finished at least the minimum %
 * of race distance and didn't DNS.
 */
export function calculateParticipationPoints(
  raceDistancePct: number,
  finishStatus: FinishStatus,
  participationPoints: number,
  participationMinDistancePct: number
): number {
  if (finishStatus === "DNS") return 0;
  if (raceDistancePct < participationMinDistancePct) return 0;
  return participationPoints;
}

/**
 * Recompute the points for a single race result and persist the new values.
 */
export async function recomputeResultPoints(
  prisma: PrismaClient,
  resultId: string
): Promise<void> {
  const result = await prisma.raceResult.findUnique({
    where: { id: resultId },
    include: {
      round: {
        include: { season: { include: { scoringSystem: true } } },
      },
    },
  });
  if (!result) return;

  const scoring = result.round.season.scoringSystem;
  const pointsTable = scoring.pointsTable as PointsTable;

  const raw = calculateRawPoints(
    result.finishPosition,
    result.finishStatus,
    pointsTable
  );
  const participation = calculateParticipationPoints(
    result.raceDistancePct,
    result.finishStatus,
    scoring.participationPoints,
    scoring.participationMinDistancePct
  );

  await prisma.raceResult.update({
    where: { id: resultId },
    data: {
      rawPointsAwarded: raw,
      participationPointsAwarded: participation,
    },
  });
}

/**
 * Recompute Fair Play Rating awards for a round based on the scoring system.
 * Wipes existing awards and creates new ones.
 */
export async function recomputeRoundFPR(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { scoringSystem: true } },
      raceResults: {
        include: {
          registration: {
            include: { team: true, carClass: true },
          },
        },
      },
    },
  });
  if (!round) return;

  // Wipe existing FPR awards for this round
  await prisma.fPRAward.deleteMany({ where: { roundId } });

  const scoring = round.season.scoringSystem;
  if (!scoring.fprEnabled) return;

  const tiers = (scoring.fprTiers as FPRTier[] | null) ?? [];
  if (tiers.length === 0) return;
  const sortedTiers = [...tiers].sort((a, b) => a.max - b.max);

  // Sum incidents per (team, class)
  type Bucket = {
    teamId: string;
    carClassId: string | null;
    incidents: number;
  };
  const buckets = new Map<string, Bucket>();

  for (const r of round.raceResults) {
    const teamId = r.registration.teamId;
    if (!teamId) continue; // Independent drivers don't contribute
    const carClassId = round.season.isMulticlass
      ? r.registration.carClassId
      : null;
    const key = `${teamId}|${carClassId ?? ""}`;
    const cur = buckets.get(key);
    if (cur) {
      cur.incidents += r.incidents;
    } else {
      buckets.set(key, { teamId, carClassId, incidents: r.incidents });
    }
  }

  if (scoring.fprMode === "ALL_TEAMS_TIERED") {
    for (const b of buckets.values()) {
      const tier = sortedTiers.find((t) => b.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: b.teamId,
          carClassId: b.carClassId,
          teamIncidentTotal: b.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  } else if (scoring.fprMode === "LOWEST_TEAM_ONLY") {
    // Group by class, pick lowest-incident team per class
    const byClass = new Map<string, Bucket[]>();
    for (const b of buckets.values()) {
      const k = b.carClassId ?? "";
      if (!byClass.has(k)) byClass.set(k, []);
      byClass.get(k)!.push(b);
    }
    for (const list of byClass.values()) {
      list.sort((a, b) => a.incidents - b.incidents);
      const winner = list[0];
      const tier = sortedTiers.find((t) => winner.incidents <= t.max);
      if (!tier) continue;
      await prisma.fPRAward.create({
        data: {
          roundId,
          teamId: winner.teamId,
          carClassId: winner.carClassId,
          teamIncidentTotal: winner.incidents,
          fprPointsAwarded: tier.points,
        },
      });
    }
  }
}

/**
 * Recompute everything for a round: per-result points + FPR awards.
 */
export async function recomputeRoundScoring(
  prisma: PrismaClient,
  roundId: string
): Promise<void> {
  const results = await prisma.raceResult.findMany({
    where: { roundId },
    select: { id: true },
  });
  for (const r of results) {
    await recomputeResultPoints(prisma, r.id);
  }
  await recomputeRoundFPR(prisma, roundId);
}
EOF

# ------------------------------------------------------------
# 3. Race results server actions
# ------------------------------------------------------------
echo ">>> Writing race result actions..."

cat > src/lib/actions/race-results.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import { parseTimeToMs } from "@/lib/time";
import type { FinishStatus } from "@prisma/client";

export async function upsertRaceResult(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  registrationId: string,
  formData: FormData
) {
  await requireAdmin();

  const finishStatus = String(
    formData.get("finishStatus") ?? "CLASSIFIED"
  ) as FinishStatus;
  const finishPositionRaw = String(
    formData.get("finishPosition") ?? ""
  ).trim();
  const finishPosition = finishPositionRaw
    ? parseInt(finishPositionRaw, 10)
    : 0;
  const lapsCompletedRaw = String(formData.get("lapsCompleted") ?? "0");
  const lapsCompleted = parseInt(lapsCompletedRaw, 10) || 0;
  const raceDistancePctRaw = String(formData.get("raceDistancePct") ?? "100");
  const raceDistancePct = Math.max(
    0,
    Math.min(100, parseInt(raceDistancePctRaw, 10) || 0)
  );
  const totalTimeMs = parseTimeToMs(
    String(formData.get("totalTime") ?? "")
  );
  const bestLapTimeMs = parseTimeToMs(
    String(formData.get("bestLapTime") ?? "")
  );
  const incidentsRaw = String(formData.get("incidents") ?? "0");
  const incidents = parseInt(incidentsRaw, 10) || 0;
  const manualPenaltyPointsRaw = String(
    formData.get("manualPenaltyPoints") ?? "0"
  );
  const manualPenaltyPoints = parseInt(manualPenaltyPointsRaw, 10) || 0;
  const manualPenaltyReason =
    String(formData.get("manualPenaltyReason") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const data = {
    finishStatus,
    finishPosition,
    lapsCompleted,
    raceDistancePct,
    totalTimeMs,
    bestLapTimeMs,
    incidents,
    manualPenaltyPoints,
    manualPenaltyReason,
    notes,
  };

  await prisma.raceResult.upsert({
    where: { roundId_registrationId: { roundId, registrationId } },
    create: { roundId, registrationId, ...data },
    update: data,
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteRaceResult(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  resultId: string
) {
  await requireAdmin();

  await prisma.raceResult.delete({ where: { id: resultId } });
  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
}
EOF

# ------------------------------------------------------------
# 4. Admin round results editor page
# ------------------------------------------------------------
echo ">>> Writing admin round results editor..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { upsertRaceResult } from "@/lib/actions/race-results";
import { formatMsToTime } from "@/lib/time";

export default async function AdminRoundResults({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}) {
  const { slug, seasonId, roundId } = await params;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: {
          league: true,
          scoringSystem: true,
        },
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  // Fetch approved registrations + their result for this round (if any)
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
        <div className="mt-2 flex items-center justify-between">
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
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/edit`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Edit round
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Scoring: <strong className="text-zinc-200">{round.season.scoringSystem.name}</strong>
          {" • "}
          Participation: {round.season.scoringSystem.participationPoints} points
          if ≥ {round.season.scoringSystem.participationMinDistancePct}% of race
          distance.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Points are recalculated automatically after each save.
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
    <label className={`block ${wide ? "col-span-2 md:col-span-3 lg:col-span-3" : ""}`}>
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
# 5. Public race results page
# ------------------------------------------------------------
echo ">>> Writing public race results page..."
ensure_dir 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]'

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMsToTime } from "@/lib/time";

export default async function PublicRoundResults({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}) {
  const { slug, seasonId, roundId } = await params;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true, carClass: true },
          },
        },
        orderBy: [
          { finishStatus: "asc" }, // CLASSIFIED before DNF/DSQ
          { finishPosition: "asc" },
        ],
      },
      fprAwards: {
        include: { team: true, carClass: true },
        orderBy: { fprPointsAwarded: "desc" },
      },
    },
  });

  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const winner = round.raceResults.find(
    (r) => r.finishStatus === "CLASSIFIED" && r.finishPosition === 1
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {round.season.league.name} {round.season.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">
          Round {round.roundNumber} — {round.name}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {round.track}
          {round.trackConfig ? ` (${round.trackConfig})` : ""} •{" "}
          {new Date(round.startsAt).toLocaleString()}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race results</h2>
        {round.raceResults.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No results entered yet for this round.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Pos</th>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">Team</th>
                  {round.season.isMulticlass && (
                    <th className="px-3 py-2">Class</th>
                  )}
                  <th className="px-3 py-2 text-right">Laps</th>
                  <th className="px-3 py-2 text-right">Time</th>
                  <th className="px-3 py-2 text-right">Best lap</th>
                  <th className="px-3 py-2 text-right">Inc</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {round.raceResults.map((r) => {
                  const total =
                    r.rawPointsAwarded +
                    r.participationPointsAwarded -
                    r.manualPenaltyPoints;
                  const gap =
                    winner && r.totalTimeMs && winner.totalTimeMs
                      ? r.totalTimeMs - winner.totalTimeMs
                      : null;
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-zinc-800 hover:bg-zinc-900"
                    >
                      <td className="px-3 py-2 font-medium">
                        {r.finishStatus === "CLASSIFIED"
                          ? r.finishPosition
                          : r.finishStatus}
                      </td>
                      <td className="px-3 py-2 text-zinc-500">
                        {r.registration.startNumber ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.registration.user.firstName}{" "}
                        {r.registration.user.lastName}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.registration.team?.name ?? "—"}
                      </td>
                      {round.season.isMulticlass && (
                        <td className="px-3 py-2 text-zinc-400">
                          {r.registration.carClass?.name ?? "—"}
                        </td>
                      )}
                      <td className="px-3 py-2 text-right text-zinc-400">
                        {r.lapsCompleted}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                        {r.finishStatus === "CLASSIFIED" && r.totalTimeMs
                          ? formatMsToTime(r.totalTimeMs)
                          : r.finishStatus === "CLASSIFIED" && gap != null
                            ? `+${formatMsToTime(gap)}`
                            : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                        {formatMsToTime(r.bestLapTimeMs) || "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-zinc-400">
                        {r.incidents}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-orange-400">
                        {total}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {round.fprAwards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">
            Fair Play Rating awards
          </h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  {round.season.isMulticlass && (
                    <th className="px-3 py-2">Class</th>
                  )}
                  <th className="px-3 py-2 text-right">Total incidents</th>
                  <th className="px-3 py-2 text-right">FPR awarded</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-medium">{a.team.name}</td>
                    {round.season.isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {a.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-zinc-400">
                      {a.teamIncidentTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-emerald-400">
                      +{a.fprPointsAwarded}
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
# 6. Update admin season detail to link round name to results page
# ------------------------------------------------------------
echo ">>> Updating admin season detail (round name → results page)..."

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminSeasonDetail({
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
      _count: {
        select: {
          registrations: true,
          teams: true,
          carClasses: true,
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const pendingCount = await prisma.registration.count({
    where: { seasonId, status: "PENDING" },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.league.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{season.name}</h1>
            <p className="text-sm text-zinc-400">
              {season.year} • {season.scoringSystem.name} •{" "}
              {season.status.replace("_", " ")}
            </p>
          </div>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/edit`}
            className="text-sm text-orange-400 hover:underline"
          >
            Edit season
          </Link>
        </div>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3 text-sm">
        <span className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-200">
          Calendar
        </span>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Roster ({season._count.registrations}
          {pendingCount > 0 && (
            <span className="ml-1 rounded bg-amber-900 px-1.5 text-xs text-amber-200">
              {pendingCount}
            </span>
          )}
          )
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Teams ({season._count.teams})
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Classes ({season._count.carClasses})
        </Link>
      </nav>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Rounds" value={season.rounds.length} />
        <Stat label="Drivers" value={season._count.registrations} />
        <Stat
          label="Multiclass"
          value={season.isMulticlass ? "Yes" : "No"}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Race calendar</h2>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + Add Round
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rd</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Results</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 text-zinc-500">{r.roundNumber}</td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
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
                  <td className="px-4 py-3 text-zinc-400">
                    {r._count.raceResults}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-3 text-xs">
                      <Link
                        href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-orange-400 hover:underline"
                      >
                        Results
                      </Link>
                      <Link
                        href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}/edit`}
                        className="text-zinc-400 hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No rounds yet. Add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 7. Update public season detail to link round name to public results
# ------------------------------------------------------------
echo ">>> Updating public season detail (round name → public results)..."

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
echo "Phase 4.1 files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo ""
echo "2. End-to-end test flow:"
echo "   a) Admin → your CAS season → Calendar → click a round name (it now"
echo "      links to the results editor)"
echo "   b) For each approved driver, fill in: Status, Position, Laps,"
echo "      Distance %, Incidents, Total time (e.g. 1:23:45.678),"
echo "      Best lap (e.g. 1:53.456). Click 'Save row'."
echo "   c) After saving, the points appear in the row header"
echo "      (raw + participation − penalty)."
echo "   d) Public season page → click the round name → see public results"
echo "      with positions, times, points, and FPR team awards."
echo ""
echo "3. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 4 Phase 1: results entry + scoring engine'"
echo "   git push"
echo ""
