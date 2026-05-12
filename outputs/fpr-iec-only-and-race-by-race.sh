#!/usr/bin/env bash
# 1. Disable FPR for every CAS scoring system except IEC (DB + seed file).
# 2. Wipe existing FPR awards for rounds in non-IEC leagues.
# 3. Add a "race-by-race" view toggle to the standings page.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. DB migration: disable FPR + wipe non-IEC awards
# ------------------------------------------------------------
mkdir -p scripts
cat > scripts/disable-non-iec-fpr.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Disable FPR on every scoring system except CAS IEC
  const updated = await prisma.scoringSystem.updateMany({
    where: { name: { not: "CAS IEC" } },
    data: { fprEnabled: false },
  });
  console.log(`Disabled FPR on ${updated.count} scoring system(s).`);

  // Wipe FPR awards belonging to rounds whose season uses a non-FPR scoring system
  const nonIecScoring = await prisma.scoringSystem.findMany({
    where: { fprEnabled: false },
    select: { id: true },
  });
  const seasons = await prisma.season.findMany({
    where: { scoringSystemId: { in: nonIecScoring.map((s) => s.id) } },
    select: { id: true },
  });
  const rounds = await prisma.round.findMany({
    where: { seasonId: { in: seasons.map((s) => s.id) } },
    select: { id: true },
  });
  const wiped = await prisma.fPRAward.deleteMany({
    where: { roundId: { in: rounds.map((r) => r.id) } },
  });
  console.log(`Deleted ${wiped.count} stale FPR award(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF

echo ">>> Running migration..."
npx tsx scripts/disable-non-iec-fpr.ts

# ------------------------------------------------------------
# 2. Update prisma/seed.ts so future seeds reflect IEC-only FPR
# ------------------------------------------------------------
echo ">>> Patching seed file (FPR only on IEC)..."
node -e "
const fs = require('fs');
const path = 'prisma/seed.ts';
let s = fs.readFileSync(path, 'utf8');

// In each scoring system block, the lines we want to change are:
//   fprEnabled: true,        →  fprEnabled: false,   (for SFL/GT4/GT3 WCT)
// We keep IEC unchanged. Use a marker-based replacement.
const blocks = ['CAS SFL Cup', 'CAS GT4 Masters', 'CAS GT3 WCT'];
for (const name of blocks) {
  const re = new RegExp(
    'name: \"' + name.replace(/[.*+?^\${}()|[\\\]\\\\]/g, '\\\\\$&') + '\"[\\\\s\\\\S]*?fprEnabled: true',
    'g'
  );
  s = s.replace(re, (m) => m.replace('fprEnabled: true', 'fprEnabled: false'));
}
fs.writeFileSync(path, s);
console.log('  Seed updated.');
"

# ------------------------------------------------------------
# 3. Standings library: add per-round points per driver
# ------------------------------------------------------------
echo ">>> Rewriting standings library with per-round points..."

cat > src/lib/standings.ts <<'EOF'
import type { PrismaClient } from "@prisma/client";

export interface RoundPoints {
  roundId: string;
  roundNumber: number;
  roundName: string;
  combinedPoints: number;
  classPoints: number;
  hasResult: boolean;
}

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
  combinedTotal: number;
  classTotal: number;
  totalIncidents: number;
  iRating: number | null;
  roundsCompleted: number;
  roundPoints: RoundPoints[];
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
  const [registrations, rounds] = await Promise.all([
    prisma.registration.findMany({
      where: { seasonId, status: "APPROVED" },
      include: {
        user: true,
        team: true,
        carClass: true,
        raceResults: { include: { round: true } },
      },
    }),
    prisma.round.findMany({
      where: { seasonId },
      orderBy: { roundNumber: "asc" },
      select: { id: true, roundNumber: true, name: true },
    }),
  ]);

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

    const resultsByRoundId = new Map(
      reg.raceResults.map((r) => [r.roundId, r])
    );

    const roundPoints: RoundPoints[] = rounds.map((round) => {
      const result = resultsByRoundId.get(round.id);
      if (!result) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundName: round.name,
          combinedPoints: 0,
          classPoints: 0,
          hasResult: false,
        };
      }
      const combined =
        result.rawPointsAwarded - result.manualPenaltyPoints;
      const cls =
        result.rawPointsAwarded +
        result.participationPointsAwarded -
        result.manualPenaltyPoints;
      return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        roundName: round.name,
        combinedPoints: combined,
        classPoints: cls,
        hasResult: true,
      };
    });

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
      roundPoints,
    };
  });

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
    include: { teams: true, scoringSystem: true },
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
# 4. Standings page: add view toggle (List ↔ Race-by-race)
# ------------------------------------------------------------
echo ">>> Rewriting standings page with race-by-race view..."

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
type ViewMode = "list" | "races";

export default async function StandingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { slug, seasonId } = await params;
  const { view: viewRaw } = await searchParams;
  const view: ViewMode = viewRaw === "races" ? "races" : "list";

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

  const combined = [...drivers].sort(
    (a, b) =>
      b.combinedTotal - a.combinedTotal ||
      b.rawPoints - a.rawPoints ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
  );

  const proDrivers = drivers.filter((d) => d.proAmClass === "PRO");
  const amDrivers = drivers.filter((d) => d.proAmClass === "AM");

  const baseHref = `/leagues/${slug}/seasons/${seasonId}/standings`;

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

        <div className="mt-4 inline-flex rounded border border-zinc-800 bg-zinc-900 p-1 text-xs">
          <Link
            href={baseHref}
            className={`rounded px-3 py-1.5 ${view === "list" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
          >
            List view
          </Link>
          <Link
            href={`${baseHref}?view=races`}
            className={`rounded px-3 py-1.5 ${view === "races" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
          >
            Race by race
          </Link>
        </div>
      </div>

      <section>
        <h2 className="mb-1 text-lg font-semibold">Combined Driver Championship</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Race points − penalties. Participation points are not included in this view.
        </p>
        {view === "races" ? (
          <RaceByRaceTable rows={combined} kind="combined" />
        ) : (
          <DriversTable rows={combined} kind="combined" showTeam showClass={season.isMulticlass} />
        )}
      </section>

      {season.proAmEnabled && (
        <>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Pro</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Race points + participation − penalties.
            </p>
            {view === "races" ? (
              <RaceByRaceTable rows={proDrivers} kind="class" />
            ) : (
              <DriversTable rows={proDrivers} kind="class" showTeam />
            )}
          </section>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Am</h2>
            <p className="mb-3 text-xs text-zinc-500">
              Race points + participation − penalties.
            </p>
            {view === "races" ? (
              <RaceByRaceTable rows={amDrivers} kind="class" />
            ) : (
              <DriversTable rows={amDrivers} kind="class" showTeam />
            )}
          </section>
        </>
      )}

      {season.isMulticlass && season.carClasses.length > 0 && (
        <>
          {season.carClasses.map((cc) => {
            const rows = drivers.filter((d) => d.carClassId === cc.id);
            return (
              <section key={cc.id}>
                <h2 className="mb-3 text-lg font-semibold">{cc.name}</h2>
                {view === "races" ? (
                  <RaceByRaceTable rows={rows} kind="class" />
                ) : (
                  <DriversTable rows={rows} kind="class" showTeam />
                )}
              </section>
            );
          })}
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
                <td className="px-3 py-2 text-zinc-500">{r.startNumber ?? "—"}</td>
                <td className="px-3 py-2 font-medium">
                  {r.driverFirstName} {r.driverLastName}
                </td>
                {showTeam && (
                  <td className="px-3 py-2 text-zinc-400">{r.teamName ?? "—"}</td>
                )}
                {showClass && (
                  <td className="px-3 py-2 text-zinc-400">{r.carClassName ?? "—"}</td>
                )}
                <td className="px-3 py-2 text-right text-zinc-400">{r.roundsCompleted}</td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.totalIncidents}</td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.iRating ?? "—"}</td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.rawPoints}</td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.participationPoints}</td>
                <td className="px-3 py-2 text-right text-red-400 tabular-nums">
                  {r.manualPenalties > 0 ? `−${r.manualPenalties}` : 0}
                </td>
                <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums">{total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function RaceByRaceTable({
  rows,
  kind,
}: {
  rows: DriverStanding[];
  kind: StandingsKind;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No standings to show yet.</p>;
  }
  // Use the first driver's roundPoints array as the column headers
  const rounds = rows[0].roundPoints;

  // For race-by-race, sort by total relevant to view kind (already partly sorted but ensure)
  const sorted = [...rows].sort((a, b) => {
    const at = kind === "combined" ? a.combinedTotal : a.classTotal;
    const bt = kind === "combined" ? b.combinedTotal : b.classTotal;
    return bt - at;
  });

  return (
    <div className="overflow-x-auto rounded border border-zinc-800">
      <table className="min-w-full text-xs">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="sticky left-0 z-10 bg-zinc-900 px-3 py-2">Pos</th>
            <th className="bg-zinc-900 px-2 py-2">#</th>
            <th className="bg-zinc-900 px-2 py-2">Driver</th>
            {rounds.map((r) => (
              <th
                key={r.roundId}
                title={r.roundName}
                className="bg-zinc-900 px-2 py-2 text-right"
              >
                R{r.roundNumber}
              </th>
            ))}
            <th className="bg-zinc-900 px-2 py-2 text-right">Inc</th>
            <th className="bg-zinc-900 px-2 py-2 text-right">iR</th>
            <th className="bg-zinc-900 px-2 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const total = kind === "combined" ? r.combinedTotal : r.classTotal;
            return (
              <tr
                key={r.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-2 font-medium">
                  {idx + 1}
                </td>
                <td className="px-2 py-2 text-zinc-500">{r.startNumber ?? "—"}</td>
                <td className="px-2 py-2 font-medium whitespace-nowrap">
                  {r.driverFirstName} {r.driverLastName}
                </td>
                {r.roundPoints.map((rp) => {
                  const points =
                    kind === "combined" ? rp.combinedPoints : rp.classPoints;
                  return (
                    <td
                      key={rp.roundId}
                      className="px-2 py-2 text-right tabular-nums"
                    >
                      {rp.hasResult ? (
                        <span className="text-zinc-300">{points}</span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-right text-zinc-400 tabular-nums">{r.totalIncidents}</td>
                <td className="px-2 py-2 text-right text-zinc-400 tabular-nums">{r.iRating ?? "—"}</td>
                <td className="px-2 py-2 text-right font-bold text-orange-400 tabular-nums">{total}</td>
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
              <td className="px-3 py-2 text-right text-zinc-400">{r.driversCount}</td>
              <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">{r.scoringPoints}</td>
              <td className="px-3 py-2 text-right text-emerald-400 tabular-nums">
                {r.fprPoints > 0 ? `+${r.fprPoints}` : 0}
              </td>
              <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums">{r.totalPoints}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
EOF

echo ""
echo "Done. Refresh the standings page — look for the 'List view / Race by race' toggle near the top."
echo "FPR is now disabled on every CAS league except IEC."
