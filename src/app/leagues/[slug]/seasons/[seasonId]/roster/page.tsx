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

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          where: { status: { in: ["APPROVED", "PENDING"] } },
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
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.league.name} {season.name} {season.year}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Team roster</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {teamsWithRegs.length} team
            {teamsWithRegs.length === 1 ? "" : "s"}
            {" · "}
            {driverTotal} driver{driverTotal === 1 ? "" : "s"}
            {pendingTotal > 0 && (
              <span className="ml-1 text-zinc-500">
                ({pendingTotal} pending)
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
                          {reg.user.iracingMemberId ? (
                            <Link
                              href={`/drivers/${reg.user.iracingMemberId}`}
                              className="hover:text-orange-400"
                            >
                              {reg.user.firstName} {reg.user.lastName}
                            </Link>
                          ) : (
                            <>
                              {reg.user.firstName} {reg.user.lastName}
                            </>
                          )}
                          {ri === 0 && (
                            <span
                              className="ml-1 text-amber-400"
                              title="Team leader"
                            >
                              ★
                            </span>
                          )}
                        </div>
                        {reg.status === "PENDING" && (
                          <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            Pending
                          </div>
                        )}
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
                        <FlagBadge
                          value={reg.iracingInvitationSent}
                          labels={{ YES: "Sent", NO: "Not sent" }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={reg.iracingInvitationAccepted}
                          labels={{ YES: "Accepted", NO: "Not accepted" }}
                        />
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
    where: { seasonId, status: { in: ["APPROVED", "PENDING"] } },
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
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;

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
          {registrations.length}{" "}
          {registrations.length === 1 ? "driver" : "drivers"}
          {pendingCount > 0 && (
            <span className="ml-1 text-zinc-500">
              ({pendingCount} pending)
            </span>
          )}
        </p>
      </div>

      {registrations.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No drivers registered yet.
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
                {showFee && (
                  <th className="px-4 py-3">Fee</th>
                )}
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
                    {r.user.iracingMemberId ? (
                      <Link
                        href={`/drivers/${r.user.iracingMemberId}`}
                        className="hover:text-orange-400"
                      >
                        {r.user.firstName} {r.user.lastName}
                      </Link>
                    ) : (
                      <>
                        {r.user.firstName} {r.user.lastName}
                      </>
                    )}
                  </div>
                    {r.status === "PENDING" && (
                      <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        Pending
                      </div>
                    )}
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
                  {showFee && (
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.startingFeePaid}
                      labels={{ YES: "Paid", NO: "Not paid" }}
                    />
                  </td>
                  )}
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.iracingInvitationSent}
                      labels={{ YES: "Sent", NO: "Not sent" }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.iracingInvitationAccepted}
                      labels={{ YES: "Accepted", NO: "Not accepted" }}
                    />
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

function FlagBadge({
  value,
  labels,
}: {
  value: "PENDING" | "YES" | "NO";
  labels: { YES: string; NO: string };
}) {
  const safe = value === "PENDING" ? "NO" : value;
  const cls =
    safe === "YES"
      ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
      : "border-red-800/50 bg-red-950/40 text-red-200";
  const text = safe === "YES" ? labels.YES : labels.NO;
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs ${cls}`}
    >
      {text}
    </span>
  );
}
