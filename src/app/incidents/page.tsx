import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAccusedIn } from "@/lib/incident-visibility";
import { pageMetadata } from "@/lib/og";
import { formatDateTime } from "@/lib/date";
import { SPECIAL_MEASURE_LABEL } from "@/lib/penalty-categories";

export const metadata: Metadata = pageMetadata({
  title: "Incident Reports & Decisions",
  description:
    "Every incident report across CAS leagues with the steward's verdict, the penalty applied, and the reason — newest first.",
  url: "/incidents",
});

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-amber-900/40 text-amber-200",
  UNDER_REVIEW: "bg-blue-900/40 text-blue-200",
  DECIDED: "bg-emerald-900/40 text-emerald-200",
  DISMISSED: "bg-zinc-800 text-zinc-400",
  WITHDRAWN: "bg-zinc-800 text-zinc-500",
};

const VERDICT_TONE: Record<string, string> = {
  NO_ACTION: "bg-zinc-800 text-zinc-300",
  WARNING: "bg-amber-900/40 text-amber-200",
  REPRIMAND: "bg-amber-900/40 text-amber-200",
  TIME_PENALTY: "bg-orange-900/40 text-orange-200",
  POINTS_DEDUCTION: "bg-red-900/40 text-red-200",
  GRID_PENALTY_NEXT_ROUND: "bg-orange-900/40 text-orange-200",
  SUSPENSION: "bg-red-900/50 text-red-100",
};

type PenaltyRow = {
  type: string;
  pointsValue: number | null;
  timePenaltySeconds: number | null;
  gridPositions: number | null;
  specialMeasure: string | null;
  reason: string;
  registration: {
    user: { firstName: string | null; lastName: string | null; name: string | null };
    team: { name: string } | null;
  };
};

/** Short, human label for the penalty itself (the "how much"). */
function penaltyAmount(p: PenaltyRow): string {
  switch (p.type) {
    case "POINTS_DEDUCTION":
      return p.pointsValue != null ? `−${p.pointsValue} pts` : "Points deduction";
    case "TIME_PENALTY":
      return p.timePenaltySeconds != null ? `+${p.timePenaltySeconds}s` : "Time penalty";
    case "GRID_PENALTY":
      return p.gridPositions != null ? `${p.gridPositions} grid pos` : "Grid penalty";
    case "WARNING":
      return "Warning";
    case "SPECIAL_MEASURE":
      // Category 4 — no points, the measure itself is the payload.
      return p.specialMeasure?.trim() || SPECIAL_MEASURE_LABEL;
    default:
      return p.type.replace(/_/g, " ");
  }
}

function penaltyDriver(p: PenaltyRow, teamMode: boolean): string {
  if (teamMode && p.registration.team?.name) return p.registration.team.name;
  const u = p.registration.user;
  return (
    `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.name || "Driver"
  );
}

export default async function PublicIncidentsList({
  searchParams,
}: {
  searchParams: Promise<{ league?: string }>;
}) {
  const { league: leagueFilter } = await searchParams;

  // This page is public and shows names + verdicts only — never the written
  // accusation. The signed-in viewer is used solely to decide whether to offer
  // a "View details" link into the private report, which /reports/[reportId]
  // re-checks server-side. Signed out → viewerId stays null and nothing extra
  // is rendered.
  const viewerSession = await auth();
  const viewerId = viewerSession?.user?.id ?? null;

  const reports = await prisma.incidentReport.findMany({
    include: {
      round: { include: { season: { include: { league: true } } } },
      reporterUser: true,
      reporterRegistration: { include: { team: { select: { name: true } } } },
      involvedDrivers: {
        where: { role: "ACCUSED" },
        include: {
          registration: {
            include: { user: true, team: { select: { name: true } } },
          },
        },
      },
      decision: {
        include: {
          penalties: {
            include: {
              registration: {
                include: {
                  user: {
                    select: { firstName: true, lastName: true, name: true },
                  },
                  team: { select: { name: true } },
                },
              },
            },
          },
        },
      },
    },
    orderBy: { submittedAt: "desc" },
  });

  // Direct admin penalties (no incident report) — shown in the same feed
  // with a special marker so the public sees who got points and why.
  const manualPenalties = await prisma.penalty.findMany({
    where: { source: "ADMIN_MANUAL" },
    include: {
      round: { include: { season: { include: { league: true } } } },
      registration: {
        include: {
          user: { select: { firstName: true, lastName: true, name: true } },
          team: { select: { name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // League filter chips (only leagues that actually have reports).
  const leagueMap = new Map<string, { slug: string; name: string }>();
  for (const r of reports) {
    const lg = r.round.season.league;
    if (!leagueMap.has(lg.slug)) leagueMap.set(lg.slug, { slug: lg.slug, name: lg.name });
  }
  for (const p of manualPenalties) {
    const lg = p.round.season.league;
    if (!leagueMap.has(lg.slug)) leagueMap.set(lg.slug, { slug: lg.slug, name: lg.name });
  }
  const leagues = [...leagueMap.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  const visible = leagueFilter
    ? reports.filter((r) => r.round.season.league.slug === leagueFilter)
    : reports;
  const visibleManual = leagueFilter
    ? manualPenalties.filter(
        (p) => p.round.season.league.slug === leagueFilter
      )
    : manualPenalties;

  // Header stats over the visible set.
  const isPublished = (r: (typeof reports)[number]) =>
    !!r.decision && !!r.decision.publishedAt;
  const decidedCount = visible.filter(isPublished).length;
  const totalPointsApplied = visible.reduce((sum, r) => {
    if (!isPublished(r)) return sum;
    return (
      sum +
      r.decision!.penalties.reduce(
        (s, p) => s + (p.type === "POINTS_DEDUCTION" ? p.pointsValue ?? 0 : 0),
        0
      )
    );
  }, 0);
  const manualPointsApplied = visibleManual.reduce(
    (s, p) => s + (p.pointsValue ?? 0),
    0
  );
  const totalPoints = totalPointsApplied + manualPointsApplied;

  // Unified feed: incident reports + direct admin penalties, newest first.
  const feed = [
    ...visible.map((r) => ({
      kind: "report" as const,
      date: r.submittedAt,
      report: r,
    })),
    ...visibleManual.map((p) => ({
      kind: "manual" as const,
      date: p.createdAt,
      penalty: p,
    })),
  ].sort((a, b) => b.date.getTime() - a.date.getTime());

  const chipBase =
    "rounded-full border px-3 py-1 text-xs transition-colors";
  const chipOn = "border-orange-500 bg-orange-500/15 text-orange-200";
  const chipOff =
    "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incident Reports &amp; Decisions</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {visible.length} report{visible.length === 1 ? "" : "s"} ·{" "}
          {decidedCount} decided
          {visibleManual.length > 0 && (
            <> · {visibleManual.length} direct penalt{visibleManual.length === 1 ? "y" : "ies"}</>
          )}{" "}
          · {totalPoints} penalty point
          {totalPoints === 1 ? "" : "s"} applied.
        </p>
      </div>

      {leagues.length > 1 && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/incidents"
            className={`${chipBase} ${!leagueFilter ? chipOn : chipOff}`}
          >
            All leagues
          </Link>
          {leagues.map((lg) => (
            <Link
              key={lg.slug}
              href={`/incidents?league=${lg.slug}`}
              className={`${chipBase} ${
                leagueFilter === lg.slug ? chipOn : chipOff
              }`}
            >
              {lg.name}
            </Link>
          ))}
        </div>
      )}

      {feed.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No reports filed yet.
        </p>
      ) : (
        <div className="space-y-3">
          {feed.map((item) => {
            if (item.kind === "manual") {
              const p = item.penalty;
              const pTeamMode = !!p.round.season.teamRegistration;
              const u = p.registration.user;
              const driverLabel =
                pTeamMode && p.registration.team?.name
                  ? p.registration.team.name
                  : `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
                    u.name ||
                    "Driver";
              return (
                <article
                  key={`manual-${p.id}`}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="inline-block rounded bg-red-900/40 px-2 py-0.5 text-xs text-red-200">
                          DIRECT PENALTY
                        </span>
                        <span className="font-semibold text-zinc-100">
                          {p.round.season.league.name}
                        </span>
                        <span className="text-zinc-500">
                          {p.round.season.name} {p.round.season.year} · R
                          {p.round.roundNumber} {p.round.name}
                        </span>
                      </div>
                      <div className="text-sm text-zinc-400">
                        Direct penalty point without a reported incident —
                        issued by race control.
                      </div>
                    </div>
                    <div className="text-xs text-zinc-500">
                      {formatDateTime(p.createdAt)}
                    </div>
                  </div>

                  <div className="mt-3 rounded border border-red-900/60 bg-red-950/20 p-3">
                    <div className="text-sm text-zinc-200">
                      <span className="font-medium">{driverLabel}</span>
                      <span className="mx-1 text-zinc-500">—</span>
                      <span className="font-semibold text-red-200">
                        −{p.pointsValue ?? 0} pt{(p.pointsValue ?? 0) === 1 ? "" : "s"}
                      </span>
                    </div>
                    {p.reason && (
                      <p className="mt-2 text-sm text-zinc-300">
                        <span className="text-zinc-500">Reason: </span>
                        {p.reason}
                      </p>
                    )}
                  </div>
                </article>
              );
            }

            const r = item.report;
            const teamMode = !!r.round.season.teamRegistration;

            const reporterLabel = teamMode
              ? r.reporterRegistration?.team?.name ??
                `${r.reporterUser.firstName ?? ""} ${r.reporterUser.lastName ?? ""}`.trim()
              : `${r.reporterUser.firstName ?? ""} ${r.reporterUser.lastName ?? ""}`.trim();

            let accusedLabel: string;
            if (teamMode) {
              const teams = new Set<string>();
              for (const d of r.involvedDrivers) {
                const t = d.registration.team?.name;
                if (t) teams.add(t);
              }
              accusedLabel = teams.size === 0 ? "—" : [...teams].join(", ");
            } else {
              const names = r.involvedDrivers.map((d) =>
                `${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim()
              );
              accusedLabel = names.length === 0 ? "—" : names.join(", ");
            }

            const published = isPublished(r);
            const decision = r.decision;
            // Only the reporter and the accused driver(s) get a way in to the
            // full text from here. involvedDrivers is already filtered to
            // ACCUSED by the query above.
            const canOpen =
              viewerId != null &&
              (r.reporterUserId === viewerId ||
                isAccusedIn(r.involvedDrivers, viewerId));

            return (
              <article
                key={r.id}
                className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs ${
                          STATUS_TONE[r.status] ?? STATUS_TONE.SUBMITTED
                        }`}
                      >
                        {r.status.replace(/_/g, " ")}
                      </span>
                      <span className="font-semibold text-zinc-100">
                        {r.round.season.league.name}
                      </span>
                      <span className="text-zinc-500">
                        {r.round.season.name} {r.round.season.year} · R
                        {r.round.roundNumber} {r.round.name}
                      </span>
                    </div>
                    <div className="text-sm text-zinc-300">
                      <span className="text-zinc-500">Reporter:</span>{" "}
                      {reporterLabel || "—"}{" "}
                      <span className="text-zinc-600">→</span>{" "}
                      <span className="text-zinc-500">Accused:</span>{" "}
                      {accusedLabel}
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{formatDateTime(r.submittedAt)}</div>
                    {canOpen && (
                      <Link
                        href={`/reports/${r.id}`}
                        className="mt-1 inline-block text-[#ff6b35] hover:underline"
                      >
                        View details →
                      </Link>
                    )}
                  </div>
                </div>

                {published && decision ? (
                  <div className="mt-3 rounded border border-emerald-900/60 bg-emerald-950/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
                        Verdict
                      </span>
                      <span
                        className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${
                          VERDICT_TONE[decision.verdict] ?? "bg-zinc-800 text-zinc-300"
                        }`}
                      >
                        {decision.verdict.replace(/_/g, " ")}
                      </span>
                    </div>

                    {decision.penalties.length > 0 && (
                      <ul className="mt-2 space-y-1 text-sm">
                        {decision.penalties.map((p) => (
                          <li key={p.id} className="text-zinc-200">
                            <span className="font-medium">
                              {penaltyDriver(p, teamMode)}
                            </span>
                            <span className="mx-1 text-zinc-500">—</span>
                            {p.type === "SPECIAL_MEASURE" && (
                              <span className="mr-1 rounded bg-cyan-900/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-cyan-200">
                                {SPECIAL_MEASURE_LABEL}
                              </span>
                            )}
                            <span
                              className={
                                p.type === "SPECIAL_MEASURE"
                                  ? "font-semibold text-cyan-100"
                                  : "font-semibold text-red-200"
                              }
                            >
                              {penaltyAmount(p)}
                            </span>
                            {p.reason && p.reason !== decision.publicSummary && (
                              <span className="text-zinc-400"> · {p.reason}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}

                    {decision.publicSummary && (
                      <p className="mt-2 text-sm text-zinc-300">
                        <span className="text-zinc-500">Reason: </span>
                        {decision.publicSummary}
                      </p>
                    )}

                    {decision.publishedAt && (
                      <p className="mt-1 text-xs text-zinc-500">
                        Published {formatDateTime(decision.publishedAt)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 text-xs text-zinc-500">
                    {r.status === "DISMISSED" || r.status === "WITHDRAWN"
                      ? "No penalty — case closed without a verdict."
                      : "Awaiting the steward's decision."}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
