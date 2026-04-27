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

  // Latest round with results — used to compute "before this round" snapshot
  const latestRound = await prisma.round.findFirst({
    where: { seasonId, raceResults: { some: {} } },
    orderBy: { roundNumber: "desc" },
    select: { id: true, roundNumber: true, name: true },
  });

  const [drivers, previousDrivers, teams] = await Promise.all([
    computeDriverStandings(prisma, seasonId),
    latestRound
      ? computeDriverStandings(prisma, seasonId, [latestRound.id])
      : Promise.resolve(null as DriverStanding[] | null),
    computeTeamStandings(prisma, seasonId),
  ]);

  const sortByCombined = (a: DriverStanding, b: DriverStanding) =>
    b.combinedTotal - a.combinedTotal ||
    b.rawPoints - a.rawPoints ||
    (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "");

  const combined = [...drivers].sort(sortByCombined);
  const previousCombined = previousDrivers
    ? [...previousDrivers].sort(sortByCombined)
    : null;

  const proDrivers = drivers.filter((d) => d.proAmClass === "PRO");
  const previousPro = previousDrivers?.filter((d) => d.proAmClass === "PRO") ?? null;
  const amDrivers = drivers.filter((d) => d.proAmClass === "AM");
  const previousAm = previousDrivers?.filter((d) => d.proAmClass === "AM") ?? null;

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

        {latestRound && view === "list" && (
          <p className="mt-1 text-xs text-zinc-500">
            Deltas (▲ ▼ +/−) compare to standings before R{latestRound.roundNumber} {latestRound.name}.
          </p>
        )}

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
          <DriversTable
            rows={combined}
            previousRows={previousCombined}
            kind="combined"
            showTeam
            showClass={season.isMulticlass}
          />
        )}
      </section>

      {season.proAmEnabled && (
        <>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Pro</h2>
            {view === "races" ? (
              <RaceByRaceTable rows={proDrivers} kind="class" />
            ) : (
              <DriversTable rows={proDrivers} previousRows={previousPro} kind="class" showTeam />
            )}
          </section>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Am</h2>
            {view === "races" ? (
              <RaceByRaceTable rows={amDrivers} kind="class" />
            ) : (
              <DriversTable rows={amDrivers} previousRows={previousAm} kind="class" showTeam />
            )}
          </section>
        </>
      )}

      {season.isMulticlass && season.carClasses.length > 0 &&
        season.carClasses.map((cc) => {
          const rows = drivers.filter((d) => d.carClassId === cc.id);
          const previousRows = previousDrivers?.filter((d) => d.carClassId === cc.id) ?? null;
          return (
            <section key={cc.id}>
              <h2 className="mb-3 text-lg font-semibold">{cc.name}</h2>
              {view === "races" ? (
                <RaceByRaceTable rows={rows} kind="class" />
              ) : (
                <DriversTable rows={rows} previousRows={previousRows} kind="class" showTeam />
              )}
            </section>
          );
        })}

      {teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
          <p className="mb-3 text-xs text-zinc-500">
            {season.teamScoringMode === "SUM_BEST_N"
              ? `Best ${season.teamScoringBestN ?? 2} drivers per round`
              : "Sum of all team drivers' points"}
          </p>
          <TeamsTable rows={teams} />
        </section>
      )}
    </div>
  );
}

function PosCell({ pos, delta }: { pos: number; delta: number | null }) {
  return (
    <>
      <span className="inline-block w-6 text-right tabular-nums">{pos}</span>
      <span className="inline-block w-10 text-left text-[9px] tabular-nums">
        {delta == null || delta === 0 ? null : (
          <span className={delta > 0 ? "text-emerald-400" : "text-red-400"}>
            {delta > 0 ? "▲" : "▼"}{Math.abs(delta)}
          </span>
        )}
      </span>
    </>
  );
}

function ValueCell({
  value,
  delta,
  lowerIsBetter = false,
  width = "w-10",
}: {
  value: number | string;
  delta: number | null;
  lowerIsBetter?: boolean;
  width?: string;
}) {
  const isGood =
    delta == null || delta === 0
      ? false
      : lowerIsBetter
      ? delta < 0
      : delta > 0;
  return (
    <>
      <span className={`inline-block ${width} text-right tabular-nums`}>{value}</span>
      <span className="inline-block w-10 text-left text-[9px] tabular-nums">
        {delta == null || delta === 0 ? null : (
          <span className={isGood ? "text-emerald-400" : "text-red-400"}>
            {delta > 0 ? `+${delta}` : delta}
          </span>
        )}
      </span>
    </>
  );
}
function DriversTable({
  rows,
  previousRows,
  kind,
  showTeam,
  showClass,
}: {
  rows: DriverStanding[];
  previousRows: DriverStanding[] | null;
  kind: StandingsKind;
  showTeam?: boolean;
  showClass?: boolean;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-zinc-500">No standings to show yet.</p>;
  }

  const previousMap = new Map(
    previousRows?.map((d) => [d.registrationId, d]) ?? []
  );
  const previousPositions = new Map(
    previousRows?.map((d, i) => [d.registrationId, i + 1]) ?? []
  );

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
            const prev = previousMap.get(r.registrationId);
            const prevPos = previousPositions.get(r.registrationId) ?? null;
            const positionDelta = prevPos != null ? prevPos - (idx + 1) : null;
            const incDelta = prev ? r.totalIncidents - prev.totalIncidents : null;
            const penDelta = prev ? r.manualPenalties - prev.manualPenalties : null;
            const rawDelta = prev ? r.rawPoints - prev.rawPoints : null;
            const totalDelta = prev
              ? (kind === "combined" ? r.combinedTotal : r.classTotal) -
                (kind === "combined" ? prev.combinedTotal : prev.classTotal)
              : null;
            return (
              <tr
                key={r.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium tabular-nums"><PosCell pos={idx + 1} delta={positionDelta} /></td>
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
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums"><ValueCell value={r.totalIncidents} delta={incDelta} lowerIsBetter /></td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {r.iRating ?? "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums"><ValueCell value={r.rawPoints} delta={rawDelta} /></td>
                <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                  {r.participationPoints}
                </td>
                <td className="px-3 py-2 text-right text-red-400 tabular-nums"><ValueCell value={r.manualPenalties > 0 ? `−${r.manualPenalties}` : 0} delta={penDelta} lowerIsBetter /></td>
                <td className="px-3 py-2 text-right font-bold text-orange-400 tabular-nums"><ValueCell value={total} delta={totalDelta} width="w-12" /></td>
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
  const rounds = rows[0].roundPoints;
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
                className="bg-zinc-900 px-2 py-2 text-right whitespace-nowrap"
              >
                <div className="flex flex-col items-end leading-tight">
                  <span className="text-[9px] text-zinc-500">R{r.roundNumber}</span>
                  <span className="text-xs font-display">{r.roundName}</span>
                </div>
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
                <td className="sticky left-0 z-10 bg-zinc-950 px-3 py-2 font-medium align-top">
                  {idx + 1}
                </td>
                <td className="px-2 py-2 text-zinc-500 align-top">{r.startNumber ?? "—"}</td>
                <td className="px-2 py-2 font-medium whitespace-nowrap align-top">
                  {r.driverFirstName} {r.driverLastName}
                </td>
                {r.roundPoints.map((rp) => (
                  <td
                    key={rp.roundId}
                    className="px-2 py-2 text-right tabular-nums align-top"
                  >
                    {rp.hasResult ? (
                      <div className="flex flex-col items-end leading-tight">
                        <span className="text-zinc-200">{rp.rawPoints}</span>
                        {kind === "class" && rp.participationPoints > 0 && (
                          <span className="text-[9px] text-emerald-400">+{rp.participationPoints}</span>
                        )}
                        {rp.penaltyPoints > 0 && (
                          <span className="text-[9px] text-red-400">−{rp.penaltyPoints}</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                ))}
                <td className="px-2 py-2 text-right text-zinc-400 tabular-nums align-top">{r.totalIncidents}</td>
                <td className="px-2 py-2 text-right text-zinc-400 tabular-nums align-top">{r.iRating ?? "—"}</td>
                <td className="px-2 py-2 text-right font-bold text-orange-400 tabular-nums align-top">{total}</td>
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
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.teamId} className="border-t border-zinc-800 hover:bg-zinc-900">
              <td className="px-3 py-2 font-medium">{idx + 1}</td>
              <td className="px-3 py-2 font-medium">{r.teamName}</td>
              <td className="px-3 py-2 text-right text-zinc-400">{r.driversCount}</td>
              <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                {r.scoringPoints}
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
