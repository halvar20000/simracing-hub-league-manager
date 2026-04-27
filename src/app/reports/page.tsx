import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withdrawIncidentReport } from "@/lib/actions/incident-reports";
import { formatDateTime } from "@/lib/date";

export default async function MyReports({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin?callbackUrl=/reports");

  const { success, error } = await searchParams;

  const reports = await prisma.incidentReport.findMany({
    where: { reporterUserId: session.user.id },
    include: {
      round: { include: { season: { include: { league: true } } } },
      decision: true,
    },
    orderBy: { submittedAt: "desc" },
  });

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-bold">My Reports</h1>

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
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    SUBMITTED: "bg-amber-900 text-amber-200",
    UNDER_REVIEW: "bg-blue-900 text-blue-200",
    DECIDED: "bg-emerald-900 text-emerald-200",
    DISMISSED: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
