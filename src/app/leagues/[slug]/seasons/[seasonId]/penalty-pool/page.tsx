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
      registrationId: true,
      roundId: true,
      pointsValue: true,
      forgivenPoints: true,
      autoForgivenPoints: true,
      releasedAt: true,
    },
  });

  type DriverRow = {
    name: string;
    startNumber: number | null;
    cellsByRound: Map<string, number>;
    autoForgiven: number;
    activePool: number;
    released: number;
  };
  const rowMap = new Map<string, DriverRow>();
  for (const reg of registrations) {
    rowMap.set(reg.id, {
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
        <h1 className="mt-2 text-2xl font-bold">Penalty pool</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Penalty points incurred per round
          {season.league.slug === "cas-gt3-wct"
            ? ". Two clean races forgive 1 point automatically."
            : "."}
        </p>
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
                  title={r.name}
                >
                  R{r.roundNumber}
                </th>
              ))}
              <th className="px-2 py-2 text-right">Forgiven</th>
              <th className="px-2 py-2 text-right">Pool</th>
              <th className="px-2 py-2 text-right">Released</th>
            </tr>
          </thead>
          <tbody>
            {drivers.map((d, i) => (
              <tr
                key={i}
                className="border-t border-zinc-800"
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
                  return (
                    <td
                      key={r.id}
                      className="px-2 py-2 text-center tabular-nums"
                    >
                      {pts > 0 ? (
                        <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                          {pts}
                        </span>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
