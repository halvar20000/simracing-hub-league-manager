import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatMsToTime } from "@/lib/time";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";

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
      incidentReports: {
        where: { decision: { publishedAt: { not: null } } },
        include: {
          decision: true,
          involvedDrivers: {
            where: { role: "ACCUSED" },
            include: { registration: { include: { user: true } } },
          },
        },
      },
    },
  });

  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const session = await auth();
  let canReport = false;
  if (session?.user?.id) {
    const reg = await prisma.registration.findFirst({
      where: { seasonId, userId: session.user.id, status: "APPROVED" },
      select: { id: true },
    });
    canReport = !!reg;
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
          {formatDateTime(round.startsAt)}
        </p>
        {canReport && (
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/report`}
            className="mt-3 inline-block rounded border border-[#ff6b35] px-3 py-1.5 text-xs font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
          >
            Report an incident
          </Link>
        )}
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

      {round.incidentReports.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Steward decisions for this round</h2>
          <div className="space-y-2">
            {round.incidentReports.map((ir) => {
              const acc = ir.involvedDrivers
                .map(
                  (d) =>
                    `#${d.registration.startNumber ?? "?"} ${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim()
                )
                .join(", ");
              return (
                <div key={ir.id} className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold">{ir.decision!.verdict.replace(/_/g, " ")}</span>
                    {acc && <span className="text-xs text-zinc-400">{acc}</span>}
                  </div>
                  <p className="mt-1 text-zinc-300">{ir.decision!.publicSummary}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
