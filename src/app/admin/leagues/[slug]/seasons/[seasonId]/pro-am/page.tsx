import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import ProAmOverrideSelect from "@/components/ProAmOverrideSelect";

export default async function ProAmCalculator({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      rounds: {
        where: { countsForChampionship: true },
        orderBy: { roundNumber: "asc" },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: {
          user: true,
          carClass: true,
          raceResults: true,
        },
      },
    },
  });
  if (!season || season.league.slug !== slug) notFound();

  const totalRounds = season.rounds.length;
  // Smart-default parameters that scale with season length.
  const minStarts = Math.ceil(totalRounds / 2);
  const dropWorst = Math.floor(totalRounds / 4);
  const keepN = Math.max(1, totalRounds - dropWorst);
  const proPercent = 0.3;

  type Row = {
    regId: string;
    firstName: string | null;
    lastName: string | null;
    iracingMemberId: string | null;
    classRanking: string | null;
    proAmClass: "PRO" | "AM" | null;
    starts: number;
    rawAvg: number;
    adjustedAvg: number | null;
    avgIncidents: number;
    eligible: boolean;
  };

  const rows: Row[] = season.registrations.map((reg) => {
    const pointsByRound = new Map<string, number>();
    const incByRound = new Map<string, number>();
    for (const rr of reg.raceResults) {
      const pts =
        rr.rawPointsAwarded +
        rr.participationPointsAwarded -
        rr.manualPenaltyPoints +
        rr.correctionPoints;
      pointsByRound.set(rr.roundId, (pointsByRound.get(rr.roundId) ?? 0) + pts);
      incByRound.set(
        rr.roundId,
        (incByRound.get(rr.roundId) ?? 0) + rr.incidents
      );
    }
    const roundPoints = [...pointsByRound.values()];
    const roundIncidents = [...incByRound.values()];
    const starts = roundPoints.length;
    const rawSum = roundPoints.reduce((a, b) => a + b, 0);
    const rawAvg = starts > 0 ? rawSum / starts : 0;
    const eligible = starts >= minStarts;
    let adjustedAvg: number | null = null;
    if (eligible) {
      const sorted = [...roundPoints].sort((a, b) => b - a);
      const keep = sorted.slice(0, Math.min(keepN, sorted.length));
      adjustedAvg = keep.reduce((a, b) => a + b, 0) / keep.length;
    }
    const avgIncidents =
      starts > 0
        ? roundIncidents.reduce((a, b) => a + b, 0) / starts
        : 0;
    return {
      proAmClass: (reg as { proAmClass: "PRO" | "AM" | null }).proAmClass ?? null,
      regId: reg.id,
      firstName: reg.user.firstName,
      lastName: reg.user.lastName,
      iracingMemberId: reg.user.iracingMemberId,
      classRanking: reg.carClass?.name ?? null,
      starts,
      rawAvg,
      adjustedAvg,
      avgIncidents,
      eligible,
    };
  });

  const eligible = rows
    .filter((r) => r.eligible)
    .sort((a, b) => {
      const aa = a.adjustedAvg ?? -Infinity;
      const bb = b.adjustedAvg ?? -Infinity;
      if (bb !== aa) return bb - aa;
      // tiebreaker: cleaner FPR (lower avg incidents) wins
      return a.avgIncidents - b.avgIncidents;
    });

  const proCount = Math.ceil(eligible.length * proPercent);
  const proIds = new Set(eligible.slice(0, proCount).map((r) => r.regId));

  const unranked = rows
    .filter((r) => !r.eligible)
    .sort((a, b) => {
      const ln = (x: string | null) => (x ?? "").toLowerCase();
      return ln(a.lastName).localeCompare(ln(b.lastName));
    });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Pro/Am calculator — {season.name} {season.year}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Smart classification based on points-per-round across the season.
        </p>
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <h2 className="mb-2 font-semibold">Formula</h2>
        <ul className="list-disc space-y-1 pl-5 text-zinc-300">
          <li>
            <strong>Eligibility:</strong> driver must have started{" "}
            <strong>{minStarts}</strong> of <strong>{totalRounds}</strong>{" "}
            championship rounds. Below that → Unranked, classify manually.
          </li>
          <li>
            <strong>Adjusted average:</strong> drop the worst{" "}
            <strong>{dropWorst}</strong> results, average the best{" "}
            <strong>{keepN}</strong>.
          </li>
          <li>
            <strong>Pro cut:</strong> top <strong>30%</strong> of eligible
            drivers (currently {proCount} of {eligible.length}).
          </li>
          <li>
            <strong>Tiebreaker:</strong> cleaner FPR (lower average incidents
            per round) wins the higher slot.
          </li>
        </ul>
        <p className="mt-3 text-xs text-zinc-500">
          Multi-race rounds are aggregated (sum of points + sum of incidents
          per round). Drops absorb DNFs and chaos races. Drivers with no race
          results are listed as 0 starts.
        </p>
      </section>

      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Ranked drivers ({eligible.length}) — top {proCount} = Pro
        </h2>
        {eligible.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-500">
            No drivers meet the {minStarts}-start eligibility yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Rank</th>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">iRacing ID</th>
                  <th className="px-3 py-2">Starts</th>
                  <th className="px-3 py-2">Raw avg</th>
                  <th className="px-3 py-2">Best {keepN} avg</th>
                  <th className="px-3 py-2">Avg inc.</th>
                  <th className="px-3 py-2">Suggested</th>
                  <th className="px-3 py-2">Override</th>
                </tr>
              </thead>
              <tbody>
                {eligible.map((r, i) => {
                  const isPro = proIds.has(r.regId);
                  return (
                    <tr
                      key={r.regId}
                      className="border-t border-zinc-800 hover:bg-zinc-900"
                    >
                      <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                      <td className="px-3 py-2 font-medium">
                        {r.firstName} {r.lastName}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">{r.starts}</td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.rawAvg.toFixed(2)}
                      </td>
                      <td className="px-3 py-2 font-semibold">
                        {r.adjustedAvg !== null
                          ? r.adjustedAvg.toFixed(2)
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-zinc-400">
                        {r.avgIncidents.toFixed(1)}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-block rounded border px-2 py-0.5 text-xs ${
                            isPro
                              ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
                              : "border-zinc-700/50 bg-zinc-900 text-zinc-300"
                          }`}
                        >
                          {isPro ? "Pro" : "Am"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {unranked.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Unranked ({unranked.length}) — fewer than {minStarts} starts
          </h2>
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Driver</th>
                  <th className="px-3 py-2">iRacing ID</th>
                  <th className="px-3 py-2">Starts</th>
                  <th className="px-3 py-2">Raw avg</th>
                  <th className="px-3 py-2">Avg inc.</th>
                  <th className="px-3 py-2">Override</th>
                </tr>
              </thead>
              <tbody>
                {unranked.map((r) => (
                  <tr
                    key={r.regId}
                    className="border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2 font-medium">
                      {r.firstName} {r.lastName}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.iracingMemberId ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">{r.starts}</td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.rawAvg.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {r.avgIncidents.toFixed(1)}
                    </td>
                    <td className="px-3 py-2">
                      <ProAmOverrideSelect
                        registrationId={r.regId}
                        value={r.proAmClass}
                        suggested="UNRANKED"
                      />
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
