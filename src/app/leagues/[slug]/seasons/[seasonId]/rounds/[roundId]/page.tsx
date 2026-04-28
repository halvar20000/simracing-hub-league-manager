import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMsToTime } from "@/lib/time";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";

type Cls = "combined" | "byclass";

export default async function PublicRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ cls?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { cls: clsRaw } = await searchParams;
  const cls: Cls = clsRaw === "byclass" ? "byclass" : "combined";

  await auth(); // session not required, but read so layout cookies stay fresh

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
          { finishStatus: "asc" },
          { finishPosition: "asc" },
        ],
      },
      fprAwards: {
        include: {
          registration: {
            include: { team: true, carClass: true, user: true },
          },
        },
      },
    },
  });
  if (!round || round.season.league.slug !== slug || round.seasonId !== seasonId) {
    notFound();
  }

  const baseHref =
    `/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;
  const isMulticlass = round.season.isMulticlass;

  // Combined-view winner (used for gap calc in combined mode)
  const winner = round.raceResults.find(
    (r) => r.finishStatus === "CLASSIFIED" && r.finishPosition === 1
  );

  // Group rows by carClass for by-class view, ordered Pro -> AM -> others.
  type Row = (typeof round.raceResults)[number];
  type Group = {
    classId: string;
    className: string;
    proAmClass: string | null;
    displayOrder: number;
    rows: Row[];
  };
  const groupMap = new Map<string, Group>();
  for (const r of round.raceResults) {
    const cc = r.registration.carClass;
    const key = cc?.id ?? "unclassified";
    let g = groupMap.get(key);
    if (!g) {
      g = {
        classId: key,
        className: cc?.name ?? "Unclassified",
        proAmClass: (cc?.proAmClass as string | undefined) ?? null,
        displayOrder: cc?.displayOrder ?? 999,
        rows: [],
      };
      groupMap.set(key, g);
    }
    g.rows.push(r);
  }
  const groups = [...groupMap.values()].sort((a, b) => {
    const orderOf = (g: Group) =>
      g.proAmClass === "PRO" ? 0 : g.proAmClass === "AM" ? 1 : 2 + g.displayOrder;
    return orderOf(a) - orderOf(b);
  });
  for (const g of groups) {
    g.rows.sort((a, b) => {
      if (a.finishStatus !== b.finishStatus) {
        if (a.finishStatus === "CLASSIFIED") return -1;
        if (b.finishStatus === "CLASSIFIED") return 1;
      }
      return a.finishPosition - b.finishPosition;
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            R{round.roundNumber} · {round.trackName ?? "Round"}
          </h1>
          <p className="text-sm text-zinc-400">
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

      {isMulticlass && (
        <div className="flex items-center gap-2 text-sm">
          <span className="text-zinc-500">View:</span>
          <Link
            href={baseHref}
            className={`rounded px-3 py-1.5 ${
              cls === "combined"
                ? "bg-[#ff6b35] text-zinc-950"
                : "text-zinc-300 hover:text-zinc-100"
            }`}
          >
            Combined
          </Link>
          <Link
            href={`${baseHref}?cls=byclass`}
            className={`rounded px-3 py-1.5 ${
              cls === "byclass"
                ? "bg-[#ff6b35] text-zinc-950"
                : "text-zinc-300 hover:text-zinc-100"
            }`}
          >
            By class
          </Link>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race results</h2>
        {round.raceResults.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No results entered yet for this round.
          </p>
        ) : cls === "byclass" && isMulticlass ? (
          <div className="space-y-6">
            {groups.map((g) => (
              <ResultsTable
                key={g.classId}
                heading={g.className}
                rows={g.rows}
                isMulticlass={false}
                renumberWithinGroup
              />
            ))}
          </div>
        ) : (
          <ResultsTable
            heading={null}
            rows={round.raceResults}
            isMulticlass={isMulticlass}
            renumberWithinGroup={false}
            winnerTotalTimeMs={winner?.totalTimeMs ?? null}
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
                  <th className="px-3 py-2">Driver</th>
                  {isMulticlass && <th className="px-3 py-2">Class</th>}
                  <th className="px-3 py-2 text-right">FPR</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2">
                      {a.registration.user.firstName}{" "}
                      {a.registration.user.lastName}
                    </td>
                    {isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {a.registration.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right font-semibold text-orange-400">
                      {a.fprPoints}
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
  heading,
  rows,
  isMulticlass,
  renumberWithinGroup,
  winnerTotalTimeMs = null,
}: {
  heading: string | null;
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
    };
  }>;
  isMulticlass: boolean;
  renumberWithinGroup: boolean;
  winnerTotalTimeMs?: number | null;
}) {
  // For class view we recompute the "winner" within the group
  const groupWinnerTotalTimeMs = renumberWithinGroup
    ? rows.find(
        (r) => r.finishStatus === "CLASSIFIED" && r.totalTimeMs != null
      )?.totalTimeMs ?? null
    : winnerTotalTimeMs;

  let classifiedCount = 0;

  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      {heading && (
        <div className="bg-zinc-900 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-zinc-300">
          {heading}
        </div>
      )}
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
            const total =
              r.rawPointsAwarded +
              r.participationPointsAwarded -
              r.manualPenaltyPoints;
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
                <td className="px-3 py-2">
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}
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
