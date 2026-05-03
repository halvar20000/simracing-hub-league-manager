import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicSeasonRoster({
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

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { carClass: { displayOrder: "asc" } },
      { startNumber: "asc" },
      { user: { lastName: "asc" } },
    ],
  });

  const showClass = season.isMulticlass;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Roster</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {registrations.length} approved{" "}
          {registrations.length === 1 ? "driver" : "drivers"}
        </p>
      </div>

      {registrations.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No approved drivers yet.
        </p>
      ) : (
        <div className="overflow-x-auto rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Driver</th>
                <th className="px-4 py-3">iRacing ID</th>
                <th className="px-4 py-3">Team</th>
                {showClass && <th className="px-4 py-3">Class</th>}
                <th className="px-4 py-3">Car</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800 hover:bg-zinc-900">
                  <td className="px-4 py-3 text-zinc-400">
                    {r.startNumber ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.user.iracingMemberId ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.team?.name ?? "Independent"}
                  </td>
                  {showClass && (
                    <td className="px-4 py-3 text-zinc-400">
                      {r.carClass?.name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-3 text-zinc-400">
                    {r.car?.name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
