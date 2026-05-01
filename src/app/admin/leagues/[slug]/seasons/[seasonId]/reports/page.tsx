import { requireSteward } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { pullReviewsFromIRLM } from "@/lib/actions/irlm-reviews-import";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function AdminReportsQueue({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ pulled?: string; seen?: string; skippedDecided?: string; skippedNoMember?: string; existed?: string; rounds?: string; error?: string }>;
}) {
  const sp = await searchParams;
  await requireSteward();
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
    withdrawn: reports.filter((r) => r.status === "WITHDRAWN").length,
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
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="mt-2 text-2xl font-bold">Incident Reports</h1>
          {season.irlmLeagueName && (
            <form action={pullReviewsFromIRLM}>
              <input type="hidden" name="leagueSlug" value={slug} />
              <input type="hidden" name="seasonId" value={seasonId} />
              <SubmitWithSpinner
                label="Pull open reports from iRLM"
                pendingLabel="Pulling from iRLM…"
                className="rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900"
              />
            </form>
          )}
        </div>
        {sp.error && (
          <div className="mb-3 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">{sp.error}</div>
        )}
        {sp.pulled != null && (
          <div className="mb-3 rounded border border-emerald-800 bg-emerald-950/40 p-3 text-xs text-emerald-200 space-y-0.5">
            <p>Imported <strong>{sp.pulled}</strong> open report{sp.pulled === "1" ? "" : "s"} from iRLM (across {sp.rounds} round{sp.rounds === "1" ? "" : "s"}).</p>
            <p className="text-emerald-300/80">
              Saw {sp.seen} review{sp.seen === "1" ? "" : "s"} in total ·
              skipped {sp.skippedDecided} already decided ·
              skipped {sp.skippedNoMember} with no roster match ·
              {sp.existed} already imported.
            </p>
          </div>
        )}
        <p className="mt-1 text-sm text-zinc-400">
          {reports.length} total — {counts.submitted} new, {counts.review}{" "}
          under review, {counts.decided} decided, {counts.dismissed} dismissed, {counts.withdrawn} withdrawn
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
