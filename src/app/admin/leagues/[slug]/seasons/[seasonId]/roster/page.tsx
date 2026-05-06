import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  approveRegistration,
  rejectRegistration,
} from "@/lib/actions/admin-registrations";
import RegistrationFlagSelect from "@/components/RegistrationFlagSelect";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          include: { user: true, carClass: true, car: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const teamsWithRegs = teams.filter((t) => t.registrations.length > 0);
    const driverTotal = teamsWithRegs.reduce(
      (s, t) => s + t.registrations.length,
      0
    );
    const pendingTotal = teamsWithRegs.reduce(
      (s, t) =>
        s + t.registrations.filter((r) => r.status === "PENDING").length,
      0
    );
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
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
          <h1 className="mt-2 text-2xl font-bold">Team roster</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {teamsWithRegs.length} team
            {teamsWithRegs.length === 1 ? "" : "s"}
            {" · "}
            {driverTotal} driver{driverTotal === 1 ? "" : "s"}
            {pendingTotal > 0 && (
              <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                {pendingTotal} pending
              </span>
            )}
          </p>
        </div>

        {teamsWithRegs.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No teams registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Car</th>
                  <th className="px-4 py-3">iRacing ID</th>
                  <th className="px-4 py-3">iRating</th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Invite
                  </th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Accepted
                  </th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {teamsWithRegs.flatMap((team) =>
                  team.registrations.map((reg, ri) => (
                    <tr
                      key={reg.id}
                      className={
                        ri === 0
                          ? "border-t-2 border-zinc-700 bg-zinc-950/40"
                          : "border-t border-zinc-800 hover:bg-zinc-900"
                      }
                    >
                      <td className="px-4 py-3 align-top text-zinc-400">
                        {ri === 0 ? fmtDate(team.createdAt) : ""}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {ri === 0 && (
                          <div className="font-semibold text-zinc-100">
                            {team.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {reg.user.firstName} {reg.user.lastName}
                          {ri === 0 && (
                            <span
                              className="ml-1 text-amber-400"
                              title="Team leader"
                            >
                              ★
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.carClass?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.car?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.user.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{reg.iRating ?? "—"}</td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationSent"
                          value={reg.iracingInvitationSent}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationAccepted"
                          value={reg.iracingInvitationAccepted}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={
                            reg.status === "APPROVED"
                              ? "rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200"
                              : reg.status === "PENDING"
                              ? "rounded bg-amber-900/40 px-2 py-0.5 text-amber-200"
                              : "rounded bg-zinc-800 px-2 py-0.5 text-zinc-400"
                          }
                        >
                          {reg.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }


  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const pendingCount = registrations.filter(
    (r) => r.status === "PENDING"
  ).length;
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;

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

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">iRacing ID</th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Car</th>
              <th className="px-4 py-3">Pro/Am</th>
              <th className="px-4 py-3">Status</th>
              {showFee && (
              <th className="px-4 py-3">Fee</th>
              )}
              <th className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">iRacing</div>
                Invite
              </th>
              <th className="px-4 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">iRacing</div>
                Accepted
              </th>
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
                  {r.car?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.proAmClass ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                {showFee && (
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="startingFeePaid"
                    value={r.startingFeePaid}
                  />
                </td>
                )}
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationSent"
                    value={r.iracingInvitationSent}
                  />
                </td>
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationAccepted"
                    value={r.iracingInvitationAccepted}
                  />
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
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/roster/${r.id}/edit`}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={12}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
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
