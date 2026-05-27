import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: { select: { name: true, slug: true } } },
  });
  if (!season) return {};
  return pageMetadata({
    title: `Penalty pool — ${season.league.name} ${season.name} ${season.year}`,
    description: `Penalty points incurred per round, auto-forgiveness and current pool balance for every driver in ${season.league.name} ${season.name} ${season.year}.`,
    url: `/leagues/${slug}/seasons/${seasonId}/penalty-pool`,
  });
}

export default async function PenaltyPoolPublicPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, scoringSystem: true },
  });
  if (!season || season.league.slug !== slug) notFound();
  // When the scoring system has no penalty pool configured, this page is
  // effectively empty — bounce back to the season landing.
  if (season.scoringSystem.penaltyPoolMode === "OFF") notFound();

  const poolMode = season.scoringSystem.penaltyPoolMode;
  // SFL mode: pool shows only no-show penalties; no auto-forgiveness columns.
  const isNoShowOnly = poolMode === "NO_SHOW_ONLY";
  const isFull = poolMode === "FULL";

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
      // In NO_SHOW_ONLY mode the pool view restricts to no-show entries —
      // reporting / steward penalties hit standings but stay out of the pool.
      ...(isNoShowOnly ? { source: "NO_RSVP_NO_SHOW" as const } : {}),
    },
    select: {
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
    name: string;
    registrationId: string;
    startNumber: number | null;
    cellsByRound: Map<string, number>;
    autoForgiven: number;
    activePool: number;
    released: number;
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
    if (p.releasedAt) row.released += effective;
    else row.activePool += effective;
    row.autoForgiven += p.autoForgivenPoints;
  }

  const drivers = Array.from(rowMap.values()).sort((a, b) => {
    const aN = a.startNumber ?? 9999;
    const bN = b.startNumber ?? 9999;
    if (aN !== bN) return aN - bN;
    return a.name.localeCompare(b.name);
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {isNoShowOnly ? "No-show register" : "Penalty pool"}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {isNoShowOnly
            ? "Points deducted when a driver neither RSVPs nor races. Reporting / steward penalties are applied directly to standings and not shown here."
            : isFull
              ? "Penalty points incurred per round. Two clean races forgive 1 point automatically."
              : "Penalty points incurred per round."}
        </p>
      </div>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-900 text-xs uppercase tracking-wider text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left driver-col">Driver</th>
              {rounds.map((r) => (
                <th
                  key={r.id}
                  className="px-2 py-2 text-center"
                  title={r.name}
                >
                  R{r.roundNumber}
                </th>
              ))}
              {isFull && <th className="px-2 py-2 text-right">Forgiven</th>}
              <th className="px-2 py-2 text-right">
                {isNoShowOnly ? "Total" : "Pool"}
              </th>
              {isFull && <th className="px-2 py-2 text-right">Released</th>}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr
                key={i}
                className="border-t border-zinc-800"
              >
                <td className="px-3 py-2 whitespace-nowrap driver-col">
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
                  // Clean-race highlighting only makes sense when there's a
                  // forgiveness mechanism — i.e. in FULL mode.
                  const cleanCompleted =
                    isFull && pts === 0 && entered && r.status === "COMPLETED";
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
                {isFull && (
                  <td className="px-2 py-2 text-right tabular-nums text-cyan-300">
                    {d.autoForgiven > 0 ? `−${d.autoForgiven}` : ""}
                  </td>
                )}
                <td className="px-2 py-2 text-right tabular-nums font-semibold">
                  {d.activePool > 0 ? d.activePool : (
                    <span className="text-zinc-600">0</span>
                  )}
                </td>
                {isFull && (
                  <td className="px-2 py-2 text-right tabular-nums text-red-300">
                    {d.released > 0 ? d.released : ""}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
