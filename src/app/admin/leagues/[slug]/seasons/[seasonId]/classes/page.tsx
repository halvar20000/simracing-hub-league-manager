import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ClassesListPage({
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

  const classes = await prisma.carClass.findMany({
    where: { seasonId },
    orderBy: { displayOrder: "asc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Car classes</h1>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + New Class
          </Link>
        </div>
        {!season.isMulticlass && (
          <div className="mt-2 rounded border border-amber-800 bg-amber-950 p-3 text-xs text-amber-200">
            This season isn&apos;t marked as multiclass. Classes still exist as
            data but won&apos;t be required at registration. Edit the season to
            enable multiclass mode if needed.
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Short code</th>
              <th className="px-4 py-3">Drivers</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr
                key={c.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3 text-zinc-500">{c.displayOrder}</td>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-zinc-400">{c.shortCode}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {c._count.registrations}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leagues/${slug}/seasons/${seasonId}/classes/${c.id}/edit`}
                    className="text-orange-400 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No classes yet. Add one (e.g., GT3, GT4, LMP2).
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
