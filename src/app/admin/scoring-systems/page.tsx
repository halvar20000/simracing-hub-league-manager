import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ScoringSystemsList({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const { saved } = await searchParams;

  const systems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { seasons: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Admin
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Scoring systems</h1>
        <p className="text-sm text-zinc-400">
          Define how points are awarded per position, plus participation,
          bonuses, and drop-week rules. Changes recompute every round of
          every season using the system.
        </p>
      </div>

      {saved && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Saved.
        </div>
      )}

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2 text-right">Seasons</th>
              <th className="px-3 py-2 text-right">P1 pts</th>
              <th className="px-3 py-2 text-right">Part. pts</th>
              <th className="px-3 py-2 text-right">Drop weeks</th>
              <th className="px-3 py-2 text-right">FL bonus</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {systems.map((s) => {
              const tbl = (s.pointsTable as Record<string, number>) ?? {};
              const p1 = tbl["1"] ?? null;
              return (
                <tr key={s.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-right text-zinc-400">
                    {s._count.seasons}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {p1 ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.participationPoints} @ {s.participationMinDistancePct}%
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.dropWorstNRounds ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {s.bonusFastestLap ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Link
                      href={`/admin/scoring-systems/${s.id}/edit`}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
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
