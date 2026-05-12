#!/usr/bin/env bash
# Week 5 Phase 1 — Driver-side incident reports + admin reports queue (view-only).
# - Drivers can file an incident report from a race results page
# - Drivers see their own reports at /reports
# - Admins see all reports for a season at the new Reports tab
# - View admin/driver detail of a single report
# Phase 5.2 will add the decision editor + penalty workflow + public decisions page.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Server action — createIncidentReport
# ------------------------------------------------------------
echo ">>> Writing incident-reports action..."

cat > src/lib/actions/incident-reports.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import type { EvidenceKind } from "@prisma/client";

export async function createIncidentReport(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();

  const reporterReg = await prisma.registration.findFirst({
    where: { seasonId, userId: sessionUser.id, status: "APPROVED" },
  });
  if (!reporterReg) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=Only+approved+drivers+can+file+reports`
    );
  }

  const round = await prisma.round.findFirst({
    where: { id: roundId, seasonId },
  });
  if (!round) {
    redirect(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  }

  const lapNumberRaw = String(formData.get("lapNumber") ?? "").trim();
  const lapNumber = lapNumberRaw ? parseInt(lapNumberRaw, 10) : null;
  const turnOrSector =
    String(formData.get("turnOrSector") ?? "").trim() || null;
  const description = String(formData.get("description") ?? "").trim();
  const involvedNumbersRaw = String(
    formData.get("involvedStartNumbers") ?? ""
  ).trim();
  const evidenceLinksRaw = String(formData.get("evidenceLinks") ?? "").trim();

  if (!description) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/report?error=Description+is+required`
    );
  }

  const report = await prisma.incidentReport.create({
    data: {
      roundId,
      reporterUserId: sessionUser.id,
      reporterRegistrationId: reporterReg.id,
      lapNumber,
      turnOrSector,
      description,
      status: "SUBMITTED",
      submittedAt: new Date(),
    },
  });

  // Reporter is always tagged
  await prisma.incidentReportInvolvedDriver.create({
    data: {
      incidentReportId: report.id,
      registrationId: reporterReg.id,
      role: "REPORTER",
    },
  });

  // Parse involved start numbers → match to season's roster → tag as ACCUSED
  if (involvedNumbersRaw) {
    const numbers = involvedNumbersRaw
      .split(/[,;\s]+/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => !Number.isNaN(n));
    for (const num of numbers) {
      const reg = await prisma.registration.findFirst({
        where: { seasonId, startNumber: num, status: "APPROVED" },
      });
      if (!reg || reg.id === reporterReg.id) continue;
      await prisma.incidentReportInvolvedDriver
        .create({
          data: {
            incidentReportId: report.id,
            registrationId: reg.id,
            role: "ACCUSED",
          },
        })
        .catch(() => {
          // ignore duplicates
        });
    }
  }

  // Parse evidence (one URL per line) and detect kind
  if (evidenceLinksRaw) {
    const lines = evidenceLinksRaw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      let kind: EvidenceKind = "URL";
      const lc = line.toLowerCase();
      if (lc.includes("youtu.be") || lc.includes("youtube.com"))
        kind = "YOUTUBE_LINK";
      else if (/\.(jpg|jpeg|png|gif|webp)(\?|$)/i.test(line))
        kind = "IMAGE_URL";
      await prisma.incidentReportEvidence.create({
        data: {
          incidentReportId: report.id,
          kind,
          content: line,
          addedByUserId: sessionUser.id,
        },
      });
    }
  }

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath("/reports");
  redirect("/reports?success=1");
}

export async function withdrawIncidentReport(reportId: string) {
  const sessionUser = await requireAuth();
  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
  });
  if (!report || report.reporterUserId !== sessionUser.id) {
    redirect("/reports");
  }
  if (report.status !== "SUBMITTED") {
    redirect("/reports?error=Cannot+withdraw+a+report+already+under+review");
  }
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "DISMISSED" },
  });
  revalidatePath("/reports");
  redirect("/reports");
}
EOF

# ------------------------------------------------------------
# 2. Driver: report form
# ------------------------------------------------------------
echo ">>> Writing driver report form..."
ensure_dir 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report'

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx' <<'EOF'
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createIncidentReport } from "@/lib/actions/incident-reports";

export default async function FileReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const { error } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/report`
    );
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();

  const reporterReg = await prisma.registration.findFirst({
    where: {
      seasonId,
      userId: session.user.id,
      status: "APPROVED",
    },
    include: { user: true },
  });
  if (!reporterReg) {
    return (
      <div className="space-y-3">
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="font-display text-2xl font-bold">
          Report an incident
        </h1>
        <p className="text-sm text-zinc-400">
          Only approved drivers in this season can file incident reports.
        </p>
      </div>
    );
  }

  const action = createIncidentReport.bind(null, slug, seasonId, roundId);

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="mt-2 font-display text-2xl font-bold">
          Report an incident
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          Round {round.roundNumber} — {round.name}
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-sm text-zinc-400">
        Filing as:{" "}
        <span className="font-semibold text-zinc-200">
          {reporterReg.user.firstName} {reporterReg.user.lastName}
        </span>
        {reporterReg.startNumber != null && (
          <span> #{reporterReg.startNumber}</span>
        )}
      </div>

      <form action={action} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Lap number (optional)
            </span>
            <input
              name="lapNumber"
              type="number"
              min={1}
              max={999}
              placeholder="e.g. 12"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Turn or sector (optional)
            </span>
            <input
              name="turnOrSector"
              type="text"
              placeholder="e.g. T3 / sector 2"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Other driver(s) by start number
          </span>
          <input
            name="involvedStartNumbers"
            type="text"
            placeholder="e.g. 26, 89"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Comma-separated. The system matches each number to a driver in the
            roster. You are automatically included as the reporter.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Description <span className="text-orange-400">*</span>
          </span>
          <textarea
            name="description"
            required
            rows={5}
            placeholder="What happened? Be factual and specific."
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Evidence links (optional)
          </span>
          <textarea
            name="evidenceLinks"
            rows={3}
            placeholder={"One per line — YouTube URL with timestamp, screenshot link, etc."}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Submit report
          </button>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 3. Driver: My reports + report detail
# ------------------------------------------------------------
echo ">>> Writing /reports + /reports/[reportId]..."
ensure_dir src/app/reports
ensure_dir 'src/app/reports/[reportId]'

cat > src/app/reports/page.tsx <<'EOF'
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
EOF

cat > 'src/app/reports/[reportId]/page.tsx' <<'EOF'
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
EOF

# ------------------------------------------------------------
# 4. Admin: reports queue + report detail
# ------------------------------------------------------------
echo ">>> Writing admin reports queue..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/page.tsx' <<'EOF'
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
EOF

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx' <<'EOF'
import { redirect } from "next/navigation";

// Reuse the shared report detail page; it already handles admin viewers.
export default async function AdminReportDetailRedirect({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; reportId: string }>;
}) {
  const { reportId } = await params;
  redirect(`/reports/${reportId}`);
}
EOF

# ------------------------------------------------------------
# 5. Add "Report an incident" button to public round results page
# ------------------------------------------------------------
echo ">>> Patching public round results to add Report button..."

node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('Report an incident')) {
  // Need to read session in this server component to gate the button.
  // Inject auth + check + button at the top of the page header.
  s = s.replace(
    /import { formatMsToTime } from \"@\/lib\/time\";/,
    \`import { formatMsToTime } from \"@/lib/time\";
import { auth } from \"@/auth\";\`
  );
  // After fetching round, check for reporter eligibility
  s = s.replace(
    /if \(!round \|\| round\.seasonId !== seasonId \|\| round\.season\.league\.slug !== slug\) \{\s*notFound\(\);\s*\}/,
    \`if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const session = await auth();
  let canReport = false;
  if (session?.user?.id) {
    const reg = await prisma.registration.findFirst({
      where: { seasonId, userId: session.user.id, status: \"APPROVED\" },
      select: { id: true },
    });
    canReport = !!reg;
  }\`
  );
  // Add button into the header (after the round date)
  s = s.replace(
    /(<p className=\"mt-1 text-sm text-zinc-400\">[\s\S]*?<\/p>)\s*<\/div>/,
    \`\$1
        {canReport && (
          <Link
            href={\\\`/leagues/\\\${slug}/seasons/\\\${seasonId}/rounds/\\\${roundId}/report\\\`}
            className=\"mt-3 inline-block rounded border border-[#ff6b35] px-3 py-1.5 text-xs font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10\"
          >
            Report an incident
          </Link>
        )}
      </div>\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

# ------------------------------------------------------------
# 6. Add Reports tab to admin season detail
# ------------------------------------------------------------
echo ">>> Adding Reports tab to admin season detail..."

node -e "
const fs = require('fs');
const path = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('Reports (')) {
  // Add reports count to the season fetch
  s = s.replace(
    /_count: \{\s*select: \{\s*registrations: true,\s*teams: true,\s*carClasses: true,\s*\},\s*\},/,
    \`_count: {
        select: {
          registrations: true,
          teams: true,
          carClasses: true,
        },
      },\`
  );
  // Add a separate count fetch + Reports tab link before Teams
  s = s.replace(
    /const pendingCount = await prisma\.registration\.count\(\{\s*where: \{ seasonId, status: \"PENDING\" \},\s*\}\);/,
    \`const pendingCount = await prisma.registration.count({
    where: { seasonId, status: \"PENDING\" },
  });
  const reportCount = await prisma.incidentReport.count({
    where: { round: { seasonId } },
  });
  const reportNewCount = await prisma.incidentReport.count({
    where: { round: { seasonId }, status: \"SUBMITTED\" },
  });\`
  );
  // Add the Reports link in the tab nav
  s = s.replace(
    /<Link\s+href=\{\`\/admin\/leagues\/\\\$\{slug\}\/seasons\/\\\$\{seasonId\}\/classes\`\}/,
    \`<Link
          href={\\\`/admin/leagues/\\\${slug}/seasons/\\\${seasonId}/reports\\\`}
          className=\"rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200\"
        >
          Reports ({reportCount}
          {reportNewCount > 0 && (
            <span className=\"ml-1 rounded bg-amber-900 px-1.5 text-xs text-amber-200\">
              {reportNewCount}
            </span>
          )}
          )
        </Link>
        <Link
          href={\\\`/admin/leagues/\\\${slug}/seasons/\\\${seasonId}/classes\\\`}\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

# ------------------------------------------------------------
# 7. Add "My Reports" link to the nav (signed-in users)
# ------------------------------------------------------------
echo ">>> Adding My Reports link to nav..."

node -e "
const fs = require('fs');
const path = 'src/components/nav.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('My Reports')) {
  s = s.replace(
    /<NavLink href=\"\/registrations\">My Registrations<\/NavLink>\s*<NavLink href=\"\/profile\">Profile<\/NavLink>/,
    \`<NavLink href=\"/registrations\">My Registrations</NavLink>
              <NavLink href=\"/reports\">My Reports</NavLink>
              <NavLink href=\"/profile\">Profile</NavLink>\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

echo ""
echo "Done. Refresh the browser. Test flow:"
echo ""
echo "1. As a registered driver, open a public round page with results"
echo "   /leagues/cas-gt3-wct/seasons/SEASONID/rounds/ROUNDID"
echo "   Click 'Report an incident', fill the form, submit"
echo ""
echo "2. Click 'My Reports' in the nav — your report appears with status SUBMITTED"
echo ""
echo "3. As admin, go to Admin → CAS GT3 WCT → your season → Reports tab"
echo "   Open the report to see all details"
echo ""
echo "Phase 5.2 next: decision editor + penalty workflow + public decisions page."
