import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function ReportDetail({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const { reportId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect("/api/auth/signin");

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
      evidence: true,
      decision: true,
    },
  });
  if (!report) notFound();

  // Reporter or admin can view
  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isOwnReport = report.reporterUserId === session.user.id;
  const isAdmin = me?.role === "ADMIN";
  if (!isOwnReport && !isAdmin) {
    redirect("/reports");
  }

  return (
    <div className="max-w-2xl space-y-5">
      <Link
        href={isOwnReport ? "/reports" : `/admin/leagues/${report.round.season.league.slug}/seasons/${report.round.seasonId}/reports`}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Back
      </Link>

      <div>
        <h1 className="font-display text-2xl font-bold">Incident Report</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {report.round.season.league.name} • Round {report.round.roundNumber}{" "}
          {report.round.name} • Filed {formatDateTime(report.submittedAt)}
        </p>
        <div className="mt-2">
          <StatusBadge status={report.status} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <Field label="Lap" value={report.lapNumber?.toString() ?? "—"} />
        <Field label="Turn / sector" value={report.turnOrSector ?? "—"} />
      </div>

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Description
        </h2>
        <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-200">
          {report.description}
        </div>
      </section>

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Involved drivers
        </h2>
        <div className="rounded border border-zinc-800">
          <table className="w-full text-sm">
            <tbody>
              {report.involvedDrivers.map((d) => (
                <tr key={d.id} className="border-b border-zinc-800 last:border-0">
                  <td className="px-3 py-2 text-zinc-500">
                    {d.registration.startNumber ?? "—"}
                  </td>
                  <td className="px-3 py-2 font-medium">
                    {d.registration.user.firstName} {d.registration.user.lastName}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-zinc-400">
                    {d.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {report.evidence.length > 0 && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Evidence
          </h2>
          <ul className="space-y-1 text-sm">
            {report.evidence.map((e) => (
              <li key={e.id}>
                <a
                  href={e.content}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#ff6b35] hover:underline break-all"
                >
                  {e.content}
                </a>
                <span className="ml-2 text-xs text-zinc-500">[{e.kind}]</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {report.decision && (
        <section className="rounded border border-emerald-800 bg-emerald-950/30 p-4">
          <h2 className="font-display text-sm font-bold uppercase tracking-wider text-emerald-300">
            Decision
          </h2>
          <p className="mt-2 font-semibold text-zinc-200">
            Verdict: {report.decision.verdict.replace(/_/g, " ")}
          </p>
          <p className="mt-2 text-sm text-zinc-300">
            {report.decision.publicSummary}
          </p>
          {report.decision.publishedAt && (
            <p className="mt-1 text-xs text-zinc-500">
              Published {formatDateTime(report.decision.publishedAt)}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="mt-1 text-zinc-200">{value}</div>
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
