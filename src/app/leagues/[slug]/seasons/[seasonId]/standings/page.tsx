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
