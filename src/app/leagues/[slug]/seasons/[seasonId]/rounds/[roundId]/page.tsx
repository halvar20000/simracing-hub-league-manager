import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMsToTime } from "@/lib/time";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";

type Cls = "combined" | "pro" | "am" | "team";
const TEAM_BEST_N = 2; // top N drivers count toward a team's round total

function ptsOf(r: {
  rawPointsAwarded: number;
  participationPointsAwarded: number;
  manualPenaltyPoints: number;
}) {
  return (
    r.rawPointsAwarded + r.participationPointsAwarded - r.manualPenaltyPoints
  );
}

function sortByFinish<R extends { finishStatus: string; finishPosition: number }>(
  rows: R[]
): R[] {
  return [...rows].sort((a, b) => {
    if (a.finishStatus !== b.finishStatus) {
      if (a.finishStatus === "CLASSIFIED") return -1;
      if (b.finishStatus === "CLASSIFIED") return 1;
    }
    return a.finishPosition - b.finishPosition;
  });
}

export default async function PublicRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ cls?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { cls: clsRaw } = await searchParams;
  const cls: Cls =
    clsRaw === "pro"
      ? "pro"
      : clsRaw === "am"
        ? "am"
        : clsRaw === "team"
          ? "team"
          : "combined";

  await auth();

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
        orderBy: [{ finishStatus: "asc" }, { finishPosition: "asc" }],
      },
      fprAwards: { include: { team: true, carClass: true } },
    },
  });
  if (
    !round ||
    round.season.league.slug !== slug ||
    round.seasonId !== seasonId
  ) {
    notFound();
  }

  const baseHref = `/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;
  const isMulticlass = round.season.isMulticlass;

  // Filtered datasets
  const allRows = round.raceResults;
  const proRows = sortByFinish(
    allRows.filter((r) => r.registration.carClass?.shortCode === "PRO")
  );
  const amRows = sortByFinish(
    allRows.filter((r) => r.registration.carClass?.shortCode === "AM")
  );

  // Team groupings
  type TeamRow = {
    teamName: string;
    drivers: typeof allRows;
    topNTotal: number;
    bestFinish: number | null;
  };
  const byTeam = new Map<string, typeof allRows>();
  for (const r of allRows) {
    const key = r.registration.team?.name ?? "Independent";
    const arr = byTeam.get(key);
    if (arr) arr.push(r);
    else byTeam.set(key, [r]);
  }
  const teamRows: TeamRow[] = [...byTeam.entries()]
    .map(([teamName, drivers]) => {
      const byPts = [...drivers].sort((a, b) => ptsOf(b) - ptsOf(a));
      const topN = byPts.slice(0, TEAM_BEST_N);
      const topNTotal = topN.reduce((sum, r) => sum + ptsOf(r), 0);
      const classifieds = drivers.filter(
        (r) => r.finishStatus === "CLASSIFIED"
      );
      const bestFinish =
        classifieds.length > 0
          ? Math.min(...classifieds.map((r) => r.finishPosition))
          : null;
      return { teamName, drivers: byPts, topNTotal, bestFinish };
    })
    .sort((a, b) => b.topNTotal - a.topNTotal);

  // Combined-view winner for gap calc
  const combinedWinner = allRows.find(
    (r) => r.finishStatus === "CLASSIFIED" && r.finishPosition === 1
  );

  const pillBase = "rounded px-3 py-1.5 transition-colors";
  const pillOn = "bg-[#ff6b35] text-zinc-950";
  const pillOff = "text-zinc-300 hover:text-zinc-100";

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            R{round.roundNumber} — {round.name}
          </h1>
          <p className="text-sm text-zinc-400">
            {round.track}
            {round.trackConfig ? ` (${round.trackConfig})` : ""}
            {" • "}
            {formatDateTime(round.startsAt)}
            {isMulticlass && " • Multiclass"}
          </p>
        </div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-100"
        >
          ← Season
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        <Link
          href={baseHref}
          className={`${pillBase} ${cls === "combined" ? pillOn : pillOff}`}
        >
          Combined
        </Link>
        {isMulticlass && (
          <>
            <Link
              href={`${baseHref}?cls=pro`}
              className={`${pillBase} ${cls === "pro" ? pillOn : pillOff}`}
            >
              Pro
            </Link>
            <Link
              href={`${baseHref}?cls=am`}
              className={`${pillBase} ${cls === "am" ? pillOn : pillOff}`}
            >
              Am
            </Link>
          </>
        )}
        <Link
          href={`${baseHref}?cls=team`}
          className={`${pillBase} ${cls === "team" ? pillOn : pillOff}`}
        >
          Team
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race results</h2>
        {allRows.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No results entered yet for this round.
          </p>
        ) : cls === "team" ? (
          <TeamView teams={teamRows} isMulticlass={isMulticlass} />
        ) : cls === "pro" ? (
          <ResultsTable
            rows={proRows}
            isMulticlass={false}
            renumberWithinGroup
          />
        ) : cls === "am" ? (
          <ResultsTable
            rows={amRows}
            isMulticlass={false}
            renumberWithinGroup
          />
        ) : (
          <ResultsTable
            rows={allRows}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            winnerTotalTimeMs={combinedWinner?.totalTimeMs ?? null}
          />
        )}
      </section>

      {round.fprAwards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">FPR awards</h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  {isMulticlass && <th className="px-3 py-2">Class</th>}
                  <th className="px-3 py-2 text-right">Team incidents</th>
                  <th className="px-3 py-2 text-right">FPR pts</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-medium">{a.team.name}</td>
                    {isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {a.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                      {a.teamIncidentTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-400 tabular-nums">
                      {a.fprPointsAwarded}
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

function ResultsTable({
  rows,
  isMulticlass,
  renumberWithinGroup,
  winnerTotalTimeMs = null,
}: {
  rows: Array<{
    id: string;
    finishStatus: string;
    finishPosition: number;
    startPosition: number | null;
    qualifyingTimeMs: number | null;
    bestLapTimeMs: number | null;
    totalTimeMs: number | null;
    lapsCompleted: number;
    incidents: number;
    rawPointsAwarded: number;
    participationPointsAwarded: number;
    manualPenaltyPoints: number;
    registration: {
      startNumber: number | null;
      user: { firstName: string | null; lastName: string | null };
      team: { name: string } | null;
      carClass: { name: string } | null;
      excludedAt: Date | null;
    };
  }>;
  isMulticlass: boolean;
  renumberWithinGroup: boolean;
  winnerTotalTimeMs?: number | null;
}) {
  const groupWinnerTotalTimeMs = renumberWithinGroup
    ? rows.find(
        (r) => r.finishStatus === "CLASSIFIED" && r.totalTimeMs != null
      )?.totalTimeMs ?? null
    : winnerTotalTimeMs;
  let classifiedCount = 0;
  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">Grid</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Driver</th>
            <th className="px-3 py-2">Team</th>
            {isMulticlass && <th className="px-3 py-2">Class</th>}
            <th className="px-3 py-2 text-right">Laps</th>
            <th className="px-3 py-2 text-right">Time</th>
            <th className="px-3 py-2 text-right">Quali</th>
            <th className="px-3 py-2 text-right">Best lap</th>
            <th className="px-3 py-2 text-right">Inc</th>
            <th className="px-3 py-2 text-right">Pts</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const total = ptsOf(r);
            const gap =
              groupWinnerTotalTimeMs && r.totalTimeMs
                ? r.totalTimeMs - groupWinnerTotalTimeMs
                : null;
            let displayPos: string | number = r.finishStatus;
            if (r.finishStatus === "CLASSIFIED") {
              if (renumberWithinGroup) {
                classifiedCount += 1;
                displayPos = classifiedCount;
              } else {
                displayPos = r.finishPosition;
              }
            }
            return (
              <tr
                key={r.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">{displayPos}</td>
                <td className="px-3 py-2 text-zinc-500">
                  {r.startPosition ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {r.registration.startNumber ?? "—"}
                </td>
                <td className={`px-3 py-2 ${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}>
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}
                  {r.registration.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {r.registration.team?.name ?? "—"}
                </td>
                {isMulticlass && (
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
                  {formatMsToTime(r.qualifyingTimeMs) || "—"}
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
  );
}

function TeamView({
  teams,
  isMulticlass,
}: {
  teams: Array<{
    teamName: string;
    drivers: Array<{
      id: string;
      finishStatus: string;
      finishPosition: number;
      incidents: number;
      rawPointsAwarded: number;
      participationPointsAwarded: number;
      manualPenaltyPoints: number;
      registration: {
        user: { firstName: string | null; lastName: string | null };
        carClass: { name: string } | null;
      };
    }>;
    topNTotal: number;
    bestFinish: number | null;
  }>;
  isMulticlass: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-zinc-500">
        Team total = sum of the top {TEAM_BEST_N} drivers&apos; points for
        this round. Click a team to expand its drivers.
      </p>
      {teams.map((team, i) => (
        <details
          key={team.teamName}
          className="overflow-hidden rounded border border-zinc-800"
        >
          <summary className="flex cursor-pointer flex-wrap items-center gap-3 bg-zinc-900 px-3 py-2 hover:bg-zinc-800">
            <span className="w-8 text-right font-medium tabular-nums text-zinc-300">
              {i + 1}
            </span>
            <span className="flex-1 font-medium">{team.teamName}</span>
            <span className="text-xs text-zinc-500">
              {team.drivers.length}{" "}
              {team.drivers.length === 1 ? "driver" : "drivers"}
            </span>
            <span className="text-xs text-zinc-400">
              Best P{team.bestFinish ?? "—"}
            </span>
            <span className="font-semibold text-orange-400 tabular-nums">
              Top {TEAM_BEST_N}: {team.topNTotal} pts
            </span>
          </summary>
          <table className="w-full text-sm">
            <thead className="bg-zinc-950 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-1.5">Pos</th>
                {isMulticlass && <th className="px-3 py-1.5">Class</th>}
                <th className="px-3 py-1.5">Driver</th>
                <th className="px-3 py-1.5 text-right">Inc</th>
                <th className="px-3 py-1.5 text-right">Pts</th>
                <th className="px-3 py-1.5 text-right">
                  In top {TEAM_BEST_N}
                </th>
              </tr>
            </thead>
            <tbody>
              {team.drivers.map((r, idx) => {
                const pts = ptsOf(r);
                const inTopN = idx < TEAM_BEST_N;
                return (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-3 py-1.5">
                      {r.finishStatus === "CLASSIFIED"
                        ? r.finishPosition
                        : r.finishStatus}
                    </td>
                    {isMulticlass && (
                      <td className="px-3 py-1.5 text-zinc-400">
                        {r.registration.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className={`px-3 py-1.5 ${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}`}>
                      {r.registration.user.firstName}{" "}
                      {r.registration.user.lastName}
                      {r.registration.excludedAt && (
                        <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                          Excluded
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right text-zinc-400">
                      {r.incidents}
                    </td>
                    <td className="px-3 py-1.5 text-right font-semibold text-orange-400 tabular-nums">
                      {pts}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {inTopN ? (
                        <span className="text-orange-400">✓</span>
                      ) : (
                        <span className="text-zinc-600">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ))}
    </div>
  );
}
