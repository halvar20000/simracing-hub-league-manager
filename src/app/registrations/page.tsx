import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  withdrawRegistration,
  retireOwnRegistration,
} from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";
import TeamManageModal from "@/components/TeamManageModal";

export default async function MyRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/registrations");
  }

  const { success, error } = await searchParams;

  const registrations = await prisma.registration.findMany({
    where: { userId: session.user.id },
    include: {
      season: { include: { league: true } },
      team: true,
      carClass: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Registrations with at least one uploaded race result — once the driver
  // has raced, the registration locks (edits then go through an admin).
  const racedResults = await prisma.raceResult.findMany({
    where: { registrationId: { in: registrations.map((r) => r.id) } },
    select: { registrationId: true },
    distinct: ["registrationId"],
  });
  const racedRegistrationIds = new Set(
    racedResults.map((r) => r.registrationId)
  );

  // Teams this user manages (Team.managerUserId) — a manager can run several
  // teams per season, so the Manage links can't come from the single
  // registration row alone.
  const managedTeams = await prisma.team.findMany({
    where: { managerUserId: session.user.id },
    select: { id: true, name: true, seasonId: true },
    orderBy: { name: "asc" },
  });
  const managedBySeason = new Map<string, { id: string; name: string }[]>();
  for (const t of managedTeams) {
    if (!managedBySeason.has(t.seasonId)) managedBySeason.set(t.seasonId, []);
    managedBySeason.get(t.seasonId)!.push({ id: t.id, name: t.name });
  }

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  });
  const driverName = me ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Registrations</h1>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          {success === "updated"
            ? "Registration updated — your approval is unchanged."
            : success === "retired"
            ? "You've retired from the season. Your results and points stay on record; your grid seat has been freed. Contact an admin if you'd like to return."
            : "Registration submitted. Awaiting admin approval."}
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-400">
            You haven&apos;t registered for any seasons yet.
          </p>
          <Link
            href="/leagues"
            className="mt-2 inline-block text-orange-400 hover:underline"
          >
            Browse leagues →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => (
            <div
              key={r.id}
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {r.season.league.name} — {r.season.name} {r.season.year}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                    <StatusBadge status={r.status} />
                    {r.retiredAt && (
                      <span className="inline-block rounded bg-amber-950 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-amber-300">
                        Retired
                      </span>
                    )}
                    {r.startNumber && (
                      <span className="text-zinc-500">
                        # {r.startNumber}
                      </span>
                    )}
                    {r.team && (
                      <span className="text-zinc-500">
                        • {r.team.name}
                      </span>
                    )}
                    {r.carClass && (
                      <span className="text-zinc-500">
                        • {r.carClass.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link
                    href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}`}
                    className="text-orange-400 hover:underline"
                  >
                    View season
                  </Link>
                  {(() => {
                    // Edit is available on solo seasons while registration is
                    // possible: PENDING any time, APPROVED only until the
                    // driver's own first race result has been uploaded. Team
                    // seasons use the Manage Team flow instead.
                    const seasonRunning =
                      r.season.status === "OPEN_REGISTRATION" ||
                      r.season.status === "ACTIVE";
                    const raced = racedRegistrationIds.has(r.id);
                    const canEdit =
                      !r.season.teamRegistration &&
                      !r.isTeamManager &&
                      seasonRunning &&
                      (r.status === "PENDING" ||
                        (r.status === "APPROVED" && !raced));
                    if (!canEdit) return null;
                    const tokenQs = r.season.registrationToken
                      ? `?t=${encodeURIComponent(r.season.registrationToken)}`
                      : "";
                    return (
                      <Link
                        href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}/register${tokenQs}`}
                        className="text-orange-400 hover:underline"
                      >
                        Edit
                      </Link>
                    );
                  })()}
                  {r.status === "APPROVED" &&
                    !r.isTeamManager &&
                    !r.retiredAt &&
                    (r.season.status === "OPEN_REGISTRATION" ||
                      r.season.status === "ACTIVE") && (
                      <form action={retireOwnRegistration.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="text-zinc-400 hover:text-amber-400"
                          title="Retire from this season — keeps your results and points and frees your grid seat. An admin can bring you back."
                        >
                          Retire
                        </button>
                      </form>
                    )}
                  {r.retiredAt && (
                    <span
                      className="text-zinc-500"
                      title="You've retired from this season. Contact an admin to be reinstated."
                    >
                      Retired · ask an admin to return
                    </span>
                  )}
                  {(r.status === "PENDING" || r.status === "APPROVED") && (
                    <form
                      action={withdrawRegistration.bind(null, r.id)}
                    >
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-400"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                  {(r.status === "WITHDRAWN" || r.status === "REJECTED") && (
                    <Link
                      href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}/register`}
                      className="text-orange-400 hover:underline"
                    >
                      Re-register
                    </Link>
                  )}
                </div>
              </div>
              {r.season.teamRegistration &&
                (() => {
                  // One link per team: the team the user leads + every team
                  // they manage (a manager can run several teams).
                  const links = new Map<string, string>();
                  if (r.team && r.team.leaderUserId === session.user.id) {
                    links.set(r.team.id, r.team.name);
                  }
                  for (const t of managedBySeason.get(r.season.id) ?? []) {
                    links.set(t.id, t.name);
                  }
                  if (links.size === 0) return null;
                  return (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {[...links].map(([id, name]) => (
                        <TeamManageModal
                          key={id}
                          teamId={id}
                          label={`Manage ${links.size > 1 ? name : "team"} →`}
                          className="inline-block rounded border border-orange-700 bg-orange-950/30 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-900/40"
                        />
                      ))}
                    </div>
                  );
                })()}
              {r.season.teamRegistration &&
                (r.season.status === "OPEN_REGISTRATION" ||
                  r.season.status === "ACTIVE") && (
                  <div className="mt-3">
                    <Link
                      href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}/register?manager=1${
                        r.season.registrationToken
                          ? `&t=${encodeURIComponent(r.season.registrationToken)}`
                          : ""
                      }`}
                      className="inline-block rounded border border-cyan-700 bg-cyan-950/30 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-900/40"
                    >
                      + Register another team as Teammanager →
                    </Link>
                    <p className="mt-1 text-xs text-zinc-500">
                      Manage a second team without driving for it — your own
                      registration here stays unchanged.
                    </p>
                  </div>
                )}
              {(() => {
                const pi = getLeaguePayment(r.season.league);
                if (!pi) return null;
                const isPaid = r.startingFeePaid === "YES";
                return (
                  <div className="mt-3">
                    <PaymentNotice
                      payment={pi}
                      paid={isPaid}
                      driverName={driverName}
                    />
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
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
