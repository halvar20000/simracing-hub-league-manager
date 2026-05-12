#!/usr/bin/env bash
# Week 5 Phase 2 — Admin decision editor + public Decisions page + penalty integration
# - Admin can issue a verdict (NO_ACTION, WARNING, REPRIMAND, TIME_PENALTY, POINTS_DEDUCTION,
#   GRID_PENALTY_NEXT_ROUND, SUSPENSION) with a public summary and optional penalty
# - Penalty rows feed into standings (decisionPenalty added to manualPenaltyPoints in totals)
# - Public Decisions page lists all published decisions per season

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Server action — admin-reports
# ------------------------------------------------------------
echo ">>> Writing admin-reports actions..."

cat > src/lib/actions/admin-reports.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { IncidentStatus, Verdict } from "@prisma/client";

export async function setReportStatus(
  leagueSlug: string,
  seasonId: string,
  reportId: string,
  status: IncidentStatus
) {
  await requireAdmin();
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status },
  });
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`);
}

export async function submitDecision(
  leagueSlug: string,
  seasonId: string,
  reportId: string,
  formData: FormData
) {
  const admin = await requireAdmin();

  const verdict = String(formData.get("verdict") ?? "NO_ACTION") as Verdict;
  const publicSummary = String(formData.get("publicSummary") ?? "").trim();
  const internalNotes =
    String(formData.get("internalNotes") ?? "").trim() || null;
  const publish = formData.get("publish") === "on";

  const accusedRegistrationId =
    String(formData.get("accusedRegistrationId") ?? "").trim() || null;
  const pointsValueRaw = String(formData.get("pointsValue") ?? "").trim();
  const pointsValue = pointsValueRaw ? Math.abs(parseInt(pointsValueRaw, 10) || 0) : 0;
  const timePenaltySecondsRaw = String(
    formData.get("timePenaltySeconds") ?? ""
  ).trim();
  const timePenaltySeconds = timePenaltySecondsRaw
    ? parseInt(timePenaltySecondsRaw, 10)
    : null;
  const gridPositionsRaw = String(formData.get("gridPositions") ?? "").trim();
  const gridPositions = gridPositionsRaw
    ? parseInt(gridPositionsRaw, 10)
    : null;
  const reason = (
    String(formData.get("penaltyReason") ?? "").trim() || publicSummary
  );

  if (!publicSummary) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}?error=Public+summary+is+required`
    );
  }

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: { round: true },
  });
  if (!report) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  }

  const decision = await prisma.incidentDecision.upsert({
    where: { incidentReportId: reportId },
    create: {
      incidentReportId: reportId,
      decidedByUserId: admin.id,
      decidedAt: new Date(),
      verdict,
      publicSummary,
      internalNotes,
      publishedAt: publish ? new Date() : null,
    },
    update: {
      decidedByUserId: admin.id,
      decidedAt: new Date(),
      verdict,
      publicSummary,
      internalNotes,
      publishedAt: publish ? new Date() : null,
    },
  });

  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: publish ? "DECIDED" : "UNDER_REVIEW" },
  });

  // Replace any existing penalties from this decision
  await prisma.penalty.deleteMany({
    where: { sourceIncidentDecisionId: decision.id },
  });

  if (
    accusedRegistrationId &&
    (verdict === "POINTS_DEDUCTION" ||
      verdict === "TIME_PENALTY" ||
      verdict === "GRID_PENALTY_NEXT_ROUND")
  ) {
    const type =
      verdict === "POINTS_DEDUCTION"
        ? "POINTS_DEDUCTION"
        : verdict === "TIME_PENALTY"
        ? "TIME_PENALTY"
        : "GRID_PENALTY";

    await prisma.penalty.create({
      data: {
        registrationId: accusedRegistrationId,
        roundId: report.roundId,
        source: "INCIDENT_DECISION",
        sourceIncidentDecisionId: decision.id,
        type,
        pointsValue: verdict === "POINTS_DEDUCTION" ? pointsValue : null,
        timePenaltySeconds: verdict === "TIME_PENALTY" ? timePenaltySeconds : null,
        gridPositions: verdict === "GRID_PENALTY_NEXT_ROUND" ? gridPositions : null,
        reason,
      },
    });
  }

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`
  );
  revalidatePath(`/reports/${reportId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`
  );
}

export async function deleteDecision(
  leagueSlug: string,
  seasonId: string,
  reportId: string
) {
  await requireAdmin();
  const decision = await prisma.incidentDecision.findUnique({
    where: { incidentReportId: reportId },
  });
  if (decision) {
    await prisma.penalty.deleteMany({
      where: { sourceIncidentDecisionId: decision.id },
    });
    await prisma.incidentDecision.delete({
      where: { incidentReportId: reportId },
    });
  }
  await prisma.incidentReport.update({
    where: { id: reportId },
    data: { status: "UNDER_REVIEW" },
  });
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports/${reportId}`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/decisions`);
}
EOF

# ------------------------------------------------------------
# 2. Replace admin report detail (was a redirect) with full editor
# ------------------------------------------------------------
echo ">>> Writing admin report editor..."

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import {
  submitDecision,
  setReportStatus,
  deleteDecision,
} from "@/lib/actions/admin-reports";

const VERDICTS = [
  { value: "NO_ACTION", label: "No action" },
  { value: "WARNING", label: "Warning" },
  { value: "REPRIMAND", label: "Reprimand" },
  { value: "TIME_PENALTY", label: "Time penalty" },
  { value: "POINTS_DEDUCTION", label: "Points deduction" },
  { value: "GRID_PENALTY_NEXT_ROUND", label: "Grid penalty next round" },
  { value: "SUSPENSION", label: "Suspension" },
];

export default async function AdminReportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; reportId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId, reportId } = await params;
  const { error } = await searchParams;

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      involvedDrivers: {
        include: { registration: { include: { user: true } } },
      },
      evidence: true,
      decision: { include: { penalties: true } },
    },
  });
  if (!report || report.round.season.league.slug !== slug) notFound();

  const accusedDrivers = report.involvedDrivers.filter(
    (d) => d.role === "ACCUSED"
  );

  const submit = submitDecision.bind(null, slug, seasonId, reportId);
  const setStatusUnderReview = setReportStatus.bind(
    null,
    slug,
    seasonId,
    reportId,
    "UNDER_REVIEW"
  );
  const setStatusDismissed = setReportStatus.bind(
    null,
    slug,
    seasonId,
    reportId,
    "DISMISSED"
  );
  const removeDecision = deleteDecision.bind(null, slug, seasonId, reportId);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/leagues/${slug}/seasons/${seasonId}/reports`}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Reports queue
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Incident Report</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Round {report.round.roundNumber} {report.round.name} • Filed{" "}
          {formatDateTime(report.submittedAt)} • Status:{" "}
          <StatusBadge status={report.status} />
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Reporter
          </h2>
          <p className="mt-1 font-medium">
            {report.reporterUser.firstName} {report.reporterUser.lastName}
          </p>
          {report.lapNumber != null && (
            <p className="text-sm text-zinc-400">Lap {report.lapNumber}</p>
          )}
          {report.turnOrSector && (
            <p className="text-sm text-zinc-400">{report.turnOrSector}</p>
          )}
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Accused
          </h2>
          {accusedDrivers.length === 0 ? (
            <p className="text-sm text-zinc-500">No drivers tagged.</p>
          ) : (
            <ul className="text-sm">
              {accusedDrivers.map((d) => (
                <li key={d.id}>
                  {d.registration.startNumber != null && (
                    <span className="text-zinc-500">
                      #{d.registration.startNumber}
                    </span>
                  )}{" "}
                  {d.registration.user.firstName} {d.registration.user.lastName}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Description
        </h2>
        <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          {report.description}
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
                  className="break-all text-[#ff6b35] hover:underline"
                >
                  {e.content}
                </a>
                <span className="ml-2 text-xs text-zinc-500">[{e.kind}]</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-wrap gap-2">
        {report.status === "SUBMITTED" && (
          <>
            <form action={setStatusUnderReview}>
              <button className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600">
                Mark Under Review
              </button>
            </form>
            <form action={setStatusDismissed}>
              <button className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Dismiss (no action)
              </button>
            </form>
          </>
        )}
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="font-display text-lg font-bold">
          {report.decision ? "Edit decision" : "Issue decision"}
        </h2>
        <p className="text-xs text-zinc-500">
          For points or time penalties, pick the accused driver and the value.
          Save as draft (unchecked) keeps the report UNDER_REVIEW; publish
          marks it DECIDED and shows the verdict on the public Decisions page.
        </p>

        <form action={submit} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Verdict</span>
            <select
              name="verdict"
              defaultValue={report.decision?.verdict ?? "NO_ACTION"}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              {VERDICTS.map((v) => (
                <option key={v.value} value={v.value}>
                  {v.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Public summary <span className="text-orange-400">*</span>
            </span>
            <textarea
              name="publicSummary"
              required
              rows={3}
              defaultValue={report.decision?.publicSummary ?? ""}
              placeholder="Shown on the public Decisions page. Be concise and factual."
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Internal notes (admin-only)
            </span>
            <textarea
              name="internalNotes"
              rows={2}
              defaultValue={report.decision?.internalNotes ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          {accusedDrivers.length > 0 && (
            <div className="rounded border border-zinc-800 p-3">
              <p className="text-xs text-zinc-500">
                Penalty target — used only for Time / Points / Grid penalties.
              </p>
              <label className="mt-2 block">
                <span className="mb-1 block text-sm text-zinc-300">
                  Accused driver
                </span>
                <select
                  name="accusedRegistrationId"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                >
                  <option value="">— Select —</option>
                  {accusedDrivers.map((d) => (
                    <option key={d.id} value={d.registrationId}>
                      #{d.registration.startNumber ?? "?"}{" "}
                      {d.registration.user.firstName}{" "}
                      {d.registration.user.lastName}
                    </option>
                  ))}
                </select>
              </label>

              <div className="mt-3 grid grid-cols-3 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">
                    Points deduction
                  </span>
                  <input
                    name="pointsValue"
                    type="number"
                    min={0}
                    placeholder="e.g. 5"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">
                    Time penalty (sec)
                  </span>
                  <input
                    name="timePenaltySeconds"
                    type="number"
                    min={0}
                    placeholder="e.g. 5"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs text-zinc-400">
                    Grid positions
                  </span>
                  <input
                    name="gridPositions"
                    type="number"
                    min={0}
                    placeholder="e.g. 3"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                  />
                </label>
              </div>
              <label className="mt-3 block">
                <span className="mb-1 block text-xs text-zinc-400">
                  Penalty reason (defaults to public summary)
                </span>
                <input
                  name="penaltyReason"
                  type="text"
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                />
              </label>
            </div>
          )}

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="publish"
              defaultChecked={report.decision?.publishedAt != null}
            />
            Publish (mark as DECIDED and show on public Decisions page)
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
            >
              Save decision
            </button>
            {report.decision && (
              <form action={removeDecision}>
                <button
                  type="submit"
                  className="rounded border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950"
                >
                  Delete decision
                </button>
              </form>
            )}
          </div>
        </form>
      </section>
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
# 3. Public Decisions page
# ------------------------------------------------------------
echo ">>> Writing public decisions page..."
mkdir -p 'src/app/leagues/[slug]/seasons/[seasonId]/decisions'

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/decisions/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";

export default async function PublicDecisions({
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

  const decisions = await prisma.incidentDecision.findMany({
    where: {
      incidentReport: { round: { seasonId } },
      publishedAt: { not: null },
    },
    include: {
      incidentReport: {
        include: {
          round: true,
          involvedDrivers: {
            include: { registration: { include: { user: true } } },
          },
        },
      },
      penalties: {
        include: { registration: { include: { user: true } } },
      },
    },
    orderBy: { publishedAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <Link
        href={`/leagues/${slug}/seasons/${seasonId}`}
        className="text-xs text-zinc-400 hover:text-zinc-200"
      >
        ← {season.league.name} {season.name}
      </Link>
      <h1 className="font-display text-2xl font-bold">Steward Decisions</h1>

      {decisions.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No decisions published for this season yet.
        </p>
      ) : (
        <div className="space-y-3">
          {decisions.map((d) => {
            const accused = d.incidentReport.involvedDrivers.filter(
              (i) => i.role === "ACCUSED"
            );
            return (
              <div
                key={d.id}
                className="rounded border border-zinc-800 bg-zinc-900 p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <span className="text-xs text-zinc-500">
                      Round {d.incidentReport.round.roundNumber}{" "}
                      {d.incidentReport.round.name} •{" "}
                      {formatDateTime(d.publishedAt)}
                    </span>
                    <h3 className="mt-1 font-semibold">
                      {d.verdict.replace(/_/g, " ")}
                    </h3>
                  </div>
                  {accused.length > 0 && (
                    <div className="text-sm text-zinc-400">
                      {accused
                        .map(
                          (a) =>
                            `#${a.registration.startNumber ?? "?"} ${a.registration.user.firstName ?? ""} ${a.registration.user.lastName ?? ""}`.trim()
                        )
                        .join(", ")}
                    </div>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-300">{d.publicSummary}</p>
                {d.penalties.length > 0 && (
                  <div className="mt-2 space-y-1 text-xs text-zinc-400">
                    {d.penalties.map((p) => (
                      <div key={p.id}>
                        <span className="text-red-300">
                          {p.type.replace(/_/g, " ")}
                        </span>{" "}
                        — {p.registration.user.firstName}{" "}
                        {p.registration.user.lastName}
                        {p.pointsValue != null && `: −${p.pointsValue} pts`}
                        {p.timePenaltySeconds != null &&
                          `: +${p.timePenaltySeconds}s`}
                        {p.gridPositions != null &&
                          `: −${p.gridPositions} grid next round`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 4. Standings: include decision-driven point penalties
# ------------------------------------------------------------
echo ">>> Patching standings to apply decision penalties..."

node -e "
const fs = require('fs');
const path = 'src/lib/standings.ts';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('penalties: { where: { type:')) {
  // Add penalties to the registration include
  s = s.replace(
    'raceResults: { include: { round: true } },',
    \`raceResults: { include: { round: true } },
        penalties: { where: { type: \"POINTS_DEDUCTION\" } },\`
  );

  // Sum decision-penalty points and add to penalty in totals
  s = s.replace(
    /let totalIncidents = 0;\s*for \(const r of reg\.raceResults\) \{\s*raw \+= r\.rawPointsAwarded;\s*participation \+= r\.participationPointsAwarded;\s*penalty \+= r\.manualPenaltyPoints;\s*totalIncidents \+= r\.incidents;\s*\}/,
    \`let totalIncidents = 0;
    for (const r of reg.raceResults) {
      raw += r.rawPointsAwarded;
      participation += r.participationPointsAwarded;
      penalty += r.manualPenaltyPoints;
      totalIncidents += r.incidents;
    }
    // Add decision-driven point penalties on top of admin-entered ones
    for (const p of reg.penalties) {
      if (p.pointsValue != null) penalty += p.pointsValue;
    }\`
  );

  fs.writeFileSync(path, s);
  console.log('  Patched standings.ts');
} else {
  console.log('  Already patched.');
}
"

# ------------------------------------------------------------
# 5. Public season detail — link to decisions
# ------------------------------------------------------------
echo ">>> Adding Decisions link to public season detail..."

node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('Decisions →')) {
  s = s.replace(
    /\{hasResults && \(\s*<Link\s*href=\{\`\/leagues\/\\\$\{slug\}\/seasons\/\\\$\{seasonId\}\/standings\`\}/,
    \`<Link
              href={\\\`/leagues/\\\${slug}/seasons/\\\${seasonId}/decisions\\\`}
              className=\"rounded border border-zinc-700 px-3 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800\"
            >
              Decisions →
            </Link>
          {hasResults && (
            <Link
              href={\\\`/leagues/\\\${slug}/seasons/\\\${seasonId}/standings\\\`}\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

# ------------------------------------------------------------
# 6. Public round results — show decisions for that round
# ------------------------------------------------------------
echo ">>> Adding decisions section to public round results..."

node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('Steward decisions for this round')) {
  // Add decisions to the round fetch
  s = s.replace(
    /fprAwards: \{[\s\S]*?orderBy: \{ fprPointsAwarded: \"desc\" \},\s*\},/,
    (m) => m + \`
      incidentReports: {
        where: { decision: { publishedAt: { not: null } } },
        include: {
          decision: true,
          involvedDrivers: {
            where: { role: \"ACCUSED\" },
            include: { registration: { include: { user: true } } },
          },
        },
      },\`
  );

  // Add the decisions section after the FPR section. Place it before the closing </div>.
  s = s.replace(
    /(\{round\.fprAwards\.length > 0 && \([\s\S]*?<\/section>\s*\)\})\s*<\/div>\s*\);\s*\}/,
    \`\$1

      {round.incidentReports.length > 0 && (
        <section>
          <h2 className=\"mb-3 text-lg font-semibold\">Steward decisions for this round</h2>
          <div className=\"space-y-2\">
            {round.incidentReports.map((ir) => {
              const acc = ir.involvedDrivers
                .map(
                  (d) =>
                    \\\`#\\\${d.registration.startNumber ?? \"?\"} \\\${d.registration.user.firstName ?? \"\"} \\\${d.registration.user.lastName ?? \"\"}\\\`.trim()
                )
                .join(\", \");
              return (
                <div key={ir.id} className=\"rounded border border-zinc-800 bg-zinc-900 p-3 text-sm\">
                  <div className=\"flex items-baseline justify-between gap-2\">
                    <span className=\"font-semibold\">{ir.decision!.verdict.replace(/_/g, \" \")}</span>
                    {acc && <span className=\"text-xs text-zinc-400\">{acc}</span>}
                  </div>
                  <p className=\"mt-1 text-zinc-300\">{ir.decision!.publicSummary}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched.');
} else {
  console.log('  Already patched.');
}
"

echo ""
echo "Done. Test flow:"
echo ""
echo "1. As admin → Reports queue → Open a report"
echo "2. Pick a verdict (try Points deduction). Pick the accused driver."
echo "3. Set points (e.g. 5). Tick 'Publish'. Save."
echo "4. Public Decisions page: /leagues/[slug]/seasons/[id]/decisions"
echo "5. Standings page: the accused driver should have penalty points subtracted"
echo "6. Round results page: shows 'Steward decisions for this round' at the bottom"
