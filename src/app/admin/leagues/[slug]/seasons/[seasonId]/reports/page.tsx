import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function AdminReportsQueue({
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

  const reports = await prisma.incidentReport.findMany({
    where: { round: { seasonId } },
    include: {
      round: true,
      reporterUser: true,
      involvedDrivers: {
        include: {
          registration: { include: { user: true } },
        },
      },
      decision: true,
    },
    orderBy: [{ status: "asc" }, { submittedAt: "asc" }],
  });

  const counts = {
    submitted: reports.filter((r) => r.status === "SUBMITTED").length,
    review: reports.filter((r) => r.status === "UNDER_REVIEW").length,
    decided: reports.filter((r) => r.status === "DECIDED").length,
    dismissed: reports.filter((r) => r.status === "DISMISSED").length,
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Incident Reports</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {reports.length} total — {counts.submitted} new, {counts.review}{" "}
          under review, {counts.decided} decided, {counts.dismissed} dismissed
        </p>
      </div>

      {reports.length === 0 ? (
        <p className="text-sm text-zinc-500">No reports filed yet.</p>
      ) : (
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2">Submitted</th>
                <th className="px-3 py-2">Round</th>
                <th className="px-3 py-2">Reporter</th>
                <th className="px-3 py-2">Accused</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => {
                const accused = r.involvedDrivers.filter(
                  (d) => d.role === "ACCUSED"
                );
                return (
                  <tr
                    key={r.id}
                    className="border-t border-zinc-800 hover:bg-zinc-900"
                  >
                    <td className="px-3 py-2 text-zinc-400">
                      {formatDateTime(r.submittedAt)}
                    </td>
                    <td className="px-3 py-2">
                      <span className="text-zinc-500">R{r.round.roundNumber}</span>{" "}
                      {r.round.name}
                    </td>
                    <td className="px-3 py-2">
                      {r.reporterUser.firstName} {r.reporterUser.lastName}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {accused.length === 0
                        ? "—"
                        : accused
                            .map(
                              (a) =>
                                `${a.registration.user.firstName ?? ""} ${a.registration.user.lastName ?? ""}`.trim()
                            )
                            .join(", ")}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link
                        href={`/admin/leagues/${slug}/seasons/${seasonId}/reports/${r.id}`}
                        className="text-[#ff6b35] hover:underline"
                      >
                        Open →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Phase 5.2 will add the decision editor (verdict, public summary, penalty).
      </p>
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
