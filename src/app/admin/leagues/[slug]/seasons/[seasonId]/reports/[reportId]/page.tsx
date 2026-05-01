import { requireSteward } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDateTime } from "@/lib/date";
import { readCategoryPoints, PENALTY_LEVELS, PENALTY_LEVEL_LABEL } from "@/lib/penalty-categories";
import {
  submitDecision,
  setReportStatus,
  deleteDecision,
} from "@/lib/actions/admin-reports";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

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
  await requireSteward();
  const { slug, seasonId, reportId } = await params;
  const { error } = await searchParams;

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: { include: { season: { include: { league: true, scoringSystem: true } } } },
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

  const categoryPointsTable = readCategoryPoints(
    report.round.season.scoringSystem.categoryPointsTable
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
            <span className="mb-1 block text-sm text-zinc-300">Penalty category</span>
            <select
              name="categoryLevel"
              defaultValue={
                report.decision?.penalties?.[0]?.categoryLevel != null
                  ? String(report.decision.penalties[0].categoryLevel)
                  : ""
              }
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— (no category)</option>
              {PENALTY_LEVELS.map((lv) => (
                <option key={lv} value={String(lv)}>
                  {PENALTY_LEVEL_LABEL[lv]} — {categoryPointsTable[String(lv)] ?? 0} pts
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              When the verdict is "Points deduction", the category determines
              how many points are removed (per this scoring system's table).
            </span>
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
