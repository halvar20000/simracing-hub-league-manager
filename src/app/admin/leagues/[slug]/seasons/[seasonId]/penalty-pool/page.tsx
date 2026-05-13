import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  releaseAllPending,
  releasePoolForRegistration,
} from "@/lib/actions/penalty-pool";
import { recomputePenaltyPoolAction } from "@/lib/actions/penalty-pool-recompute";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function PenaltyPoolAdminPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireSteward();
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, scoringSystem: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    select: {
      id: true,
      startNumber: true,
      user: { select: { firstName: true, lastName: true } },
    },
  });

  const rounds = await prisma.round.findMany({
    where: { seasonId },
    orderBy: { roundNumber: "asc" },
    select: { id: true, roundNumber: true, name: true, status: true },
  });

  const penalties = await prisma.penalty.findMany({
    where: {
      type: "POINTS_DEDUCTION",
      round: { seasonId },
    },
    select: {
      id: true,
      registrationId: true,
      roundId: true,
      pointsValue: true,
      forgivenPoints: true,
      autoForgivenPoints: true,
      releasedAt: true,
    },
  });

  // Mirror the penalty-pool engine: only CLASSIFIED and DNF count as "entered
  // and raced cleanly". DNS (didn't start) and DSQ (disqualified) do not.
  const raceResults = await prisma.raceResult.findMany({
    where: {
      round: { seasonId },
      finishStatus: { in: ["CLASSIFIED", "DNF"] },
    },
    select: { roundId: true, registrationId: true },
  });
  const enteredByReg = new Map<string, Set<string>>();
  for (const rr of raceResults) {
    let set = enteredByReg.get(rr.registrationId);
    if (!set) {
      set = new Set();
      enteredByReg.set(rr.registrationId, set);
    }
    set.add(rr.roundId);
  }

  type DriverRow = {
    registrationId: string;
    name: string;
    startNumber: number | null;
    cellsByRound: Map<string, number>;
    autoForgiven: number;
    activePool: number;
    released: number;
    hasPending: boolean;
  };

  const rowMap = new Map<string, DriverRow>();
  for (const reg of registrations) {
    rowMap.set(reg.id, {
      registrationId: reg.id,
      name: `${reg.user.firstName ?? ""} ${reg.user.lastName ?? ""}`.trim() || "—",
      startNumber: reg.startNumber,
      cellsByRound: new Map(),
      autoForgiven: 0,
      activePool: 0,
      released: 0,
      hasPending: false,
    });
  }

  for (const p of penalties) {
    const row = rowMap.get(p.registrationId);
    if (!row) continue;
    const pts = p.pointsValue ?? 0;
    row.cellsByRound.set(
      p.roundId,
      (row.cellsByRound.get(p.roundId) ?? 0) + pts
    );

    const effective = Math.max(0, pts - p.forgivenPoints - p.autoForgivenPoints);
    if (p.releasedAt) {
      row.released += effective;
    } else {
      row.activePool += effective;
      if (effective > 0) row.hasPending = true;
    }
    row.autoForgiven += p.autoForgivenPoints;
  }

  const drivers = Array.from(rowMap.values()).sort((a, b) => {
    const aN = a.startNumber ?? 9999;
    const bN = b.startNumber ?? 9999;
    if (aN !== bN) return aN - bN;
    return a.name.localeCompare(b.name);
  });

  const totals = {
    pending: drivers.reduce((s, d) => s + d.activePool, 0),
    autoForgiven: drivers.reduce((s, d) => s + d.autoForgiven, 0),
    released: drivers.reduce((s, d) => s + d.released, 0),
  };
  const releaseAll = releaseAllPending.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Penalty pool</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.deferPenaltyPoints
            ? "Pending penalty points stay in the pool until you release them. Releasing applies them to the championship standings."
            : "Penalty points apply IMMEDIATELY to standings on this scoring system. This view is informational."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded bg-amber-900/40 px-2 py-1 text-amber-200">
            Pending: <strong>{totals.pending}</strong>
          </span>
          {totals.autoForgiven > 0 && (
            <span className="rounded bg-cyan-900/40 px-2 py-1 text-cyan-200">
              Auto-forgiven: <strong>{totals.autoForgiven}</strong>
            </span>
          )}
          <span className="rounded bg-red-900/40 px-2 py-1 text-red-200">
            Released: <strong>{totals.released}</strong>
          </span>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {season.league.slug === "cas-gt3-wct" && (
          <form action={recomputePenaltyPoolAction}>
            <input type="hidden" name="seasonId" value={seasonId} />
            <input type="hidden" name="leagueSlug" value={slug} />
            <SubmitWithSpinner
              label="Recompute auto-forgiveness pool"
              pendingLabel="Recomputing…"
              className="rounded bg-cyan-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600"
            />
            <span className="ml-2 text-xs text-zinc-500">
              2 clean races forgive 1 pool point. Auto-runs after a decision is
              published and after a round is set to Completed.
            </span>
          </form>
        )}
        {season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (
          <form action={releaseAll}>
            <SubmitWithSpinner
              label={`Release ALL ${totals.pending} pending points (end of season)`}
              pendingLabel="Releasing penalties…"
              className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
            />
          </form>
        )}
      </div>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Driver</th>
              {rounds.map((r) => (
                <th
                  key={r.id}
                  className="px-2 py-2 text-center"
                  title={`${r.name}${r.status === "COMPLETED" ? " (completed)" : ""}`}
                >
                  R{r.roundNumber}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Forgiven</th>
              <th className="px-2 py-2 text-right">Pool</th>
              <th className="px-2 py-2 text-right">Released</th>
              <th className="px-2 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => {
              const releaseDriver = releasePoolForRegistration.bind(
                null,
                slug,
                seasonId,
                d.registrationId
              );
              return (
                <tr
                  key={d.registrationId}
                  className="border-t border-zinc-800 hover:bg-zinc-900/60"
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {d.startNumber != null && (
                      <span className="text-zinc-500 text-xs mr-2">
                        #{d.startNumber}
                      </span>
                    )}
                    {d.name}
                  </td>
                  {rounds.map((r) => {
                    const pts = d.cellsByRound.get(r.id) ?? 0;
                    const entered =
                      enteredByReg.get(d.registrationId)?.has(r.id) ?? false;
                    const cleanCompleted =
                      pts === 0 && entered && r.status === "COMPLETED";
                    return (
                      <td
                        key={r.id}
                        className={`px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}`}
                      >
                        {pts > 0 ? (
                          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                            {pts}
                          </span>
                        ) : cleanCompleted ? (
                          <span className="text-emerald-300" title="Clean race">✓</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right tabular-nums text-cyan-300">
                    {d.autoForgiven > 0 ? `−${d.autoForgiven}` : ""}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {d.activePool > 0 ? d.activePool : (
                      <span className="text-zinc-600">0</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-red-300">
                    {d.released > 0 ? d.released : ""}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {d.hasPending && season.scoringSystem.deferPenaltyPoints ? (
                      <form action={releaseDriver}>
                        <button
                          className="rounded bg-red-700 px-2 py-1 text-xs text-white hover:bg-red-600"
                          title="Release this driver's pending pool points to the standings"
                        >
                          Release pool
                        </button>
                      </form>
                    ) : (
                      ""
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
