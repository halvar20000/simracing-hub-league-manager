import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  approveRegistration,
  rejectRegistration,
} from "@/lib/actions/admin-registrations";

export default async function RosterPage({
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
    where: { seasonId },
    include: {
      user: true,
      team: true,
      carClass: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const pendingCount = registrations.filter((r) => r.status === "PENDING")
    .length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Roster</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {registrations.length} registration
          {registrations.length === 1 ? "" : "s"}
          {pendingCount > 0 && (
            <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
              {pendingCount} pending
            </span>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">iRacing ID</th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Pro/Am</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {r.user.firstName} {r.user.lastName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {r.user.email ?? r.user.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.user.iracingMemberId ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.startNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.team?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.carClass?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.proAmClass ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <form
                          action={approveRegistration.bind(null, r.id)}
                        >
                          <button
                            type="submit"
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectRegistration.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                          >
                            Reject
                          </button>
                        </form>
                      </>
                    )}
                    {r.status === "APPROVED" && (
                      <form action={rejectRegistration.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                        >
                          Revoke
                        </button>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-zinc-500">
        Phase 2 will add per-registration edit (start number override, team
        assignment, Pro/Am classification).
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-900 text-amber-200",
    APPROVED: "bg-emerald-900 text-emerald-200",
    REJECTED: "bg-red-900 text-red-200",
    WITHDRAWN: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
