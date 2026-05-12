#!/usr/bin/env bash
# Standings rules:
#   - Combined view: Total = raw race points - penalties (NO participation)
#   - Pro/AM views:  Total = raw + participation - penalties
# Plus add Total Incidents and iRating columns to all standings tables.
# Adds an iRating field to RaceResult and captures it from the iRLeagueManager CSV.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Schema: add iRating to RaceResult
# ------------------------------------------------------------
echo ">>> Adding iRating to RaceResult..."
node -e "
const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');
if (s.includes('iRating')) {
  console.log('  Already present.');
} else {
  s = s.replace(
    /(model RaceResult \{[\s\S]*?incidents\s+Int\s+@default\(0\))/,
    '\$1\n  iRating                     Int?'
  );
  fs.writeFileSync(p, s);
  console.log('  Added.');
}
"

echo ">>> Pushing schema..."
npx prisma db push
npx prisma generate

# ------------------------------------------------------------
# 2. CSV import: capture iRating
# ------------------------------------------------------------
echo ">>> Patching csv-import.ts to capture iRating..."

# Add colIRating detection + persist iRating in the upsert payloads
node -e "
const fs = require('fs');
const path = 'src/lib/actions/csv-import.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('colIRating')) {
  // Add header lookup near the others
  s = s.replace(
    /const colStatus = findHeader\(fields, \[\"status\"\]\);/,
    \`const colStatus = findHeader(fields, [\"status\"]);
  const colIRating = findHeader(fields, [\"irating\", \"ir\"]);\`
  );

  // Compute iRating
  s = s.replace(
    /const manualPenaltyPoints = colPenaltyPts/,
    \`let iRating: number | null = null;
    if (colIRating) {
      const v = parseInt(row[colIRating] ?? \"\", 10);
      if (!Number.isNaN(v)) iRating = v;
    }

    const manualPenaltyPoints = colPenaltyPts\`
  );

  // Add iRating to upsert
  s = s.replace(
    /manualPenaltyPoints,\s*\},\s*update: \{\s*finishStatus,/g,
    \`manualPenaltyPoints,
        iRating,
      },
      update: {
        finishStatus,\`
  );
  s = s.replace(
    /manualPenaltyPoints,\s*\},\s*\}\);\s*imported\+\+;/,
    \`manualPenaltyPoints,
        iRating,
      },
    });
    imported++;\`
  );

  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

# ------------------------------------------------------------
# 3. Rewrite standings library with combinedTotal vs classTotal
# ------------------------------------------------------------
echo ">>> Rewriting standings library..."

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
  rawPoints: number;
  participationPoints: number;
  manualPenalties: number;
  /** raw - penalties (no participation) — used for Combined standings */
  combinedTotal: number;
  /** raw + participation - penalties — used for Pro/Am class standings */
  classTotal: number;
  totalIncidents: number;
  iRating: number | null;
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
      raceResults: {
        include: { round: true },
      },
    },
  });

  const standings: DriverStanding[] = registrations.map((reg) => {
    let raw = 0;
    let participation = 0;
    let penalty = 0;
    let totalIncidents = 0;
    for (const r of reg.raceResults) {
      raw += r.rawPointsAwarded;
      participation += r.participationPointsAwarded;
      penalty += r.manualPenaltyPoints;
      totalIncidents += r.incidents;
    }

    // Latest iRating: pick from the highest-round result that has iRating set
    const sortedNewestFirst = [...reg.raceResults].sort(
      (a, b) => b.round.roundNumber - a.round.roundNumber
    );
    let iRating: number | null = null;
    for (const r of sortedNewestFirst) {
      if (r.iRating != null) {
        iRating = r.iRating;
        break;
      }
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
      rawPoints: raw,
      participationPoints: participation,
      manualPenalties: penalty,
      combinedTotal: raw - penalty,
      classTotal: raw + participation - penalty,
      totalIncidents,
      iRating,
      roundsCompleted: reg.raceResults.length,
    };
  });

  // Default sort by classTotal (used for Pro/AM). Combined view re-sorts.
  standings.sort(
    (a, b) =>
      b.classTotal - a.classTotal ||
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
        include: { registration: { select: { teamId: true } } },
      },
      fprAwards: true,
    },
  });

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
# 4. Standings page: Combined uses combinedTotal, Pro/AM use classTotal
# ------------------------------------------------------------
echo ">>> Rewriting standings page..."

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

type StandingsKind = "combined" | "class";

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

  // Combined: re-sort by combinedTotal (no participation)
  const combined = [...drivers].sort(
    (a, b) =>
      b.combinedTotal - a.combinedTotal ||
      b.rawPoints - a.rawPoints ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
  );

  // Pro/AM: filter and use existing classTotal sort from the library
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
        <h1 className="mt-2 font-display text-3xl font-bold">
          Standings — {season.name} {season.year}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.name}
          {season.proAmEnabled && " • Pro/Am"}
          {season.isMulticlass && " • Multiclass"}
        </p>
      </div>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Combined Driver Championship</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Race points − penalties. Participation points are not included in this view.
        </p>
        <DriversTable
          rows={combined}
          kind="combined"
          showTeam
          showClass={season.isMulticlass}
        />
      </section>

      {season.proAmEnabled && (
        <>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Pro</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Race points + participation − penalties.
            </p>
            <DriversTable rows={proDrivers} kind="class" showTeam />
          </section>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Am</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Race points + participation − penalties.
            </p>
            <DriversTable rows={amDrivers} kind="class" showTeam />
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
                kind="class"
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
  kind,
  showTeam,
  showClass,
}: {
  rows: DriverStanding[];
  kind: StandingsKind;
  showTeam?: boolean;
  showClass?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No standings to show yet.</p>;
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
            <th className="px-3 py-2 text-right">Inc</th>
            <th className="px-3 py-2 text-right">iR</th>
            <th className="px-3 py-2 text-right">Raw</th>
            <th className="px-3 py-2 text-right">Part.</th>
            <th className="px-3 py-2 text-right">Pen.</th>
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => {
            const total = kind === "combined" ? r.combinedTotal : r.classTotal;
            return (
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
                  {r.totalIncidents}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {r.iRating ?? "—"}
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
                  {total}
                </td>
              </tr>
            );
          })}
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

echo ""
echo "Done. Re-upload the CSV to capture iRating, then refresh the standings page."
echo "Combined uses race points only; Pro/Am use race + participation."
