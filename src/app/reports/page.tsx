import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withdrawIncidentReport } from "@/lib/actions/incident-reports";
import { formatDateTime } from "@/lib/date";
import { accusedByUserWhere } from "@/lib/incident-visibility";

export default async function MyReports({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/reports");

  const { success, error } = await searchParams;

  const userId = session.user.id;

  const [reports, against] = await Promise.all([
    prisma.incidentReport.findMany({
      where: { reporterUserId: userId },
      include: {
        round: { include: { season: { include: { league: true } } } },
        decision: true,
      },
      orderBy: { submittedAt: "desc" },
    }),
    // Reports filed AGAINST this driver. Private to them, the reporter and
    // the stewards — see src/lib/incident-visibility.ts. `reporterUserId: not`
    // guards the odd case of someone naming themselves as accused, so the
    // report doesn't appear in both lists.
    prisma.incidentReport.findMany({
      where: { ...accusedByUserWhere(userId), reporterUserId: { not: userId } },
      include: {
        round: { include: { season: { include: { league: true } } } },
        reporterUser: {
          select: { firstName: true, lastName: true, name: true },
        },
        decision: true,
      },
      orderBy: { submittedAt: "desc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">My Reports</h1>
        <a
          href="/reports/new"
          className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
        >
          + New report
        </a>
      </div>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Report submitted. Stewards will review it.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <h2 className="pt-2 font-display text-sm font-semibold uppercase tracking-wider text-zinc-400">
        Reports I filed
      </h2>

      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500">You haven't filed any reports.</p>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {r.round.season.league.name} — Round {r.round.roundNumber}{" "}
                    {r.round.name}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                    <StatusBadge status={r.status} />
                    <span>{formatDateTime(r.submittedAt)}</span>
                    {r.lapNumber && <span>• Lap {r.lapNumber}</span>}
                    {r.turnOrSector && <span>• {r.turnOrSector}</span>}
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
                    {r.description}
                  </p>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link
                    href={`/reports/${r.id}`}
                    className="text-[#ff6b35] hover:underline"
                  >
                    View details
                  </Link>
                  {r.status === "SUBMITTED" && (
                    <form action={withdrawIncidentReport.bind(null, r.id)}>
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-400"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {against.length > 0 && (
        <>
          <h2 className="pt-4 font-display text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Reports against me
          </h2>
          <p className="-mt-2 text-xs text-zinc-500">
            Private — only you, the driver who filed it and the stewards can
            read these. The public incident list never shows the text.
          </p>
          <div className="space-y-3">
            {against.map((r) => {
              const u = r.reporterUser;
              // A steward-initiated case comes from the league, not from a
              // driver — name the stewards, not the person who typed it.
              const reporter = r.stewardInitiated
                ? "the league stewards"
                : `${u?.firstName ?? ""} ${u?.lastName ?? ""}`.trim() ||
                  u?.name ||
                  "A driver";
              return (
                <div
                  key={r.id}
                  className="rounded border border-amber-900/50 bg-zinc-900 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">
                        {r.round.season.league.name} — Round{" "}
                        {r.round.roundNumber} {r.round.name}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        <StatusBadge status={r.status} />
                        <span>{formatDateTime(r.submittedAt)}</span>
                        <span>• Filed by {reporter}</span>
                        {r.lapNumber && <span>• Lap {r.lapNumber}</span>}
                        {r.turnOrSector && <span>• {r.turnOrSector}</span>}
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm text-zinc-300">
                        {r.description}
                      </p>
                    </div>
                    <Link
                      href={`/reports/${r.id}`}
                      className="text-sm text-[#ff6b35] hover:underline"
                    >
                      View details
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUBMITTED: "bg-amber-900 text-amber-200",
    UNDER_REVIEW: "bg-blue-900 text-blue-200",
    DECIDED: "bg-emerald-900 text-emerald-200",
    DISMISSED: "bg-zinc-800 text-zinc-400",
    WITHDRAWN: "bg-zinc-800 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
