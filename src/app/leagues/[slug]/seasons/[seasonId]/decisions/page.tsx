import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function PublicDecisions({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const decisions = await prisma.incidentDecision.findMany({
    where: {
      incidentReport: { round: { seasonId } },
      publishedAt: { not: null },
    },
    include: {
      incidentReport: {
        include: {
          round: true,
          involvedDrivers: {
            include: { registration: { include: { user: true } } },
          },
        },
      },
      penalties: {
        include: { registration: { include: { user: true } } },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <Link
        href={`/leagues/${slug}/seasons/${seasonId}`}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← {season.league.name} {season.name}
      </Link>
      <h1 className="font-display text-2xl font-bold">Steward Decisions</h1>

      {decisions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No decisions published for this season yet.
        </p>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => {
            const accused = d.incidentReport.involvedDrivers.filter(
              (i) => i.role === "ACCUSED"
            );
            return (
              <div
                key={d.id}
                className="rounded border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-xs text-zinc-500">
                      Round {d.incidentReport.round.roundNumber}{" "}
                      {d.incidentReport.round.name} •{" "}
                      {formatDateTime(d.publishedAt)}
                    </span>
                    <h3 className="mt-1 font-semibold">
                      {d.verdict.replace(/_/g, " ")}
                    </h3>
                  </div>
                  {accused.length > 0 && (
                    <div className="text-sm text-zinc-400">
                      {accused
                        .map(
                          (a) =>
                            `#${a.registration.startNumber ?? "?"} ${a.registration.user.firstName ?? ""} ${a.registration.user.lastName ?? ""}`.trim()
                        )
                        .join(", ")}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-300">{d.publicSummary}</p>
                {d.penalties.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-zinc-400">
                    {d.penalties.map((p) => (
                      <div key={p.id}>
                        <span className="text-red-300">
                          {p.type.replace(/_/g, " ")}
                        </span>{" "}
                        — {p.registration.user.firstName}{" "}
                        {p.registration.user.lastName}
                        {p.pointsValue != null && `: −${p.pointsValue} pts`}
                        {p.timePenaltySeconds != null &&
                          `: +${p.timePenaltySeconds}s`}
                        {p.gridPositions != null &&
                          `: −${p.gridPositions} grid next round`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
