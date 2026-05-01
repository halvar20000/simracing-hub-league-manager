import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  forgivePenalty,
  releasePenalty,
  unreleasePenalty,
  releaseAllPending,
} from "@/lib/actions/penalty-pool";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

const CATEGORY_LABEL: Record<string, string> = {
  AVOIDABLE_CONTACT: "Avoidable contact",
  CAUSING_COLLISION: "Causing a collision",
  BLOCKING: "Blocking",
  TRACK_LIMITS: "Track limits",
  JUMP_START: "Jump start",
  IGNORING_BLUE_FLAGS: "Ignoring blue flags",
  UNSPORTSMANLIKE: "Unsportsmanlike",
  CHAT_MISCONDUCT: "Chat misconduct",
  OTHER: "Other",
};

export default async function PenaltyPoolPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireSteward();
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, scoringSystem: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const penalties = await prisma.penalty.findMany({
    where: {
      type: "POINTS_DEDUCTION",
      round: { seasonId },
    },
    include: {
      round: { select: { roundNumber: true, name: true } },
      registration: {
        include: {
          user: { select: { firstName: true, lastName: true } },
        },
      },
      sourceIncidentDecision: {
        include: { incidentReport: { select: { id: true } } },
      },
    },
    orderBy: [
      { releasedAt: { sort: "asc", nulls: "first" } },
      { round: { roundNumber: "asc" } },
    ],
  });

  // Aggregate per driver
  type Row = {
    registrationId: string;
    name: string;
    startNumber: number | null;
    pendingPoints: number;
    forgivenPoints: number;
    releasedPoints: number;
    penalties: typeof penalties;
  };
  const byDriver = new Map<string, Row>();
  for (const p of penalties) {
    const id = p.registrationId;
    let row = byDriver.get(id);
    if (!row) {
      row = {
        registrationId: id,
        name: `${p.registration.user.firstName ?? ""} ${
          p.registration.user.lastName ?? ""
        }`.trim(),
        startNumber: p.registration.startNumber,
        pendingPoints: 0,
        forgivenPoints: 0,
        releasedPoints: 0,
        penalties: [],
      };
      byDriver.set(id, row);
    }
    const pts = p.pointsValue ?? 0;
    const eff = Math.max(0, pts - p.forgivenPoints);
    if (p.releasedAt) row.releasedPoints += eff;
    else row.pendingPoints += eff;
    row.forgivenPoints += p.forgivenPoints;
    row.penalties.push(p);
  }
  const drivers = Array.from(byDriver.values()).sort(
    (a, b) =>
      b.pendingPoints + b.releasedPoints - (a.pendingPoints + a.releasedPoints)
  );

  const releaseAll = releaseAllPending.bind(null, slug, seasonId);

  const totals = {
    pending: drivers.reduce((s, d) => s + d.pendingPoints, 0),
    forgiven: drivers.reduce((s, d) => s + d.forgivenPoints, 0),
    released: drivers.reduce((s, d) => s + d.releasedPoints, 0),
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
        <h1 className="mt-2 text-2xl font-bold">Penalty pool</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.deferPenaltyPoints
            ? "This scoring system DEFERS penalty points. Pending penalties are visible here but not in standings until released."
            : "This scoring system applies penalty points IMMEDIATELY. Pool view is read-only."}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-sm">
          <span className="rounded bg-amber-900/40 px-2 py-1 text-amber-200">
            Pending: <strong>{totals.pending}</strong>
          </span>
          <span className="rounded bg-emerald-900/40 px-2 py-1 text-emerald-200">
            Forgiven: <strong>{totals.forgiven}</strong>
          </span>
          <span className="rounded bg-red-900/40 px-2 py-1 text-red-200">
            Released: <strong>{totals.released}</strong>
          </span>
        </div>
      </div>

      {season.scoringSystem.deferPenaltyPoints && totals.pending > 0 && (
        <form action={releaseAll}>
          <SubmitWithSpinner
            label={`Release all ${totals.pending} pending points to standings`}
            pendingLabel="Releasing penalties…"
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          />
          <span className="ml-2 text-xs text-zinc-500">
            (Use after end-of-season review)
          </span>
        </form>
      )}

      {drivers.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No penalty points decided yet.
        </p>
      ) : (
        <div className="space-y-3">
          {drivers.map((d) => (
            <details
              key={d.registrationId}
              className="rounded border border-zinc-800 bg-zinc-900 open:bg-zinc-900"
              open={d.pendingPoints > 0}
            >
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-800">
                <span className="flex items-center gap-3">
                  {d.startNumber != null && (
                    <span className="text-xs text-zinc-500">#{d.startNumber}</span>
                  )}
                  <span className="font-medium">{d.name}</span>
                </span>
                <span className="flex items-center gap-2 text-xs">
                  {d.pendingPoints > 0 && (
                    <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                      pending {d.pendingPoints}
                    </span>
                  )}
                  {d.forgivenPoints > 0 && (
                    <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200">
                      forgiven {d.forgivenPoints}
                    </span>
                  )}
                  {d.releasedPoints > 0 && (
                    <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                      released {d.releasedPoints}
                    </span>
                  )}
                </span>
              </summary>
              <div className="border-t border-zinc-800 px-4 py-3">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-2 py-1">Round</th>
                      <th className="px-2 py-1">Category</th>
                      <th className="px-2 py-1">Reason</th>
                      <th className="px-2 py-1 text-right">Pts</th>
                      <th className="px-2 py-1 text-right">Forgive</th>
                      <th className="px-2 py-1 text-right">Effective</th>
                      <th className="px-2 py-1 text-right">Status</th>
                      <th className="px-2 py-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.penalties.map((p) => {
                      const pts = p.pointsValue ?? 0;
                      const eff = Math.max(0, pts - p.forgivenPoints);
                      const released = !!p.releasedAt;
                      const forgive = forgivePenalty.bind(null, slug, seasonId, p.id);
                      const release = releasePenalty.bind(null, slug, seasonId, p.id);
                      const unrelease = unreleasePenalty.bind(null, slug, seasonId, p.id);
                      const reportId = p.sourceIncidentDecision?.incidentReport.id;
                      return (
                        <tr
                          key={p.id}
                          className="border-t border-zinc-800 align-top"
                        >
                          <td className="px-2 py-2">
                            R{p.round.roundNumber}
                            <div className="text-xs text-zinc-500">{p.round.name}</div>
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-300">
                            {p.categoryLevel != null
                              ? `Cat ${p.categoryLevel}`
                              : p.category
                                ? CATEGORY_LABEL[p.category] ?? p.category
                                : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-400">
                            {p.reason}
                            {reportId && (
                              <Link
                                href={`/admin/leagues/${slug}/seasons/${seasonId}/reports/${reportId}`}
                                className="ml-2 text-orange-400 hover:underline"
                              >
                                report ↗
                              </Link>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{pts}</td>
                          <td className="px-2 py-2 text-right tabular-nums">
                            <form action={forgive} className="inline-flex items-center gap-1">
                              <input
                                name="forgivenPoints"
                                type="number"
                                min={0}
                                max={pts}
                                defaultValue={p.forgivenPoints || ""}
                                placeholder="0"
                                className="w-14 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-right text-sm tabular-nums"
                              />
                              <input
                                name="forgivenReason"
                                type="text"
                                defaultValue={p.forgivenReason ?? ""}
                                placeholder="reason"
                                className="w-32 rounded border border-zinc-700 bg-zinc-950 px-1.5 py-0.5 text-xs"
                              />
                              <button
                                className="rounded bg-emerald-800 px-2 py-0.5 text-xs hover:bg-emerald-700"
                                title="Save forgiveness"
                              >
                                Save
                              </button>
                            </form>
                            {p.forgivenAt && (
                              <div className="mt-0.5 text-[10px] text-zinc-500">
                                {p.forgivenReason ?? "—"}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums font-semibold">
                            {eff}
                          </td>
                          <td className="px-2 py-2 text-right text-xs">
                            {released ? (
                              <span className="rounded bg-red-900/40 px-2 py-0.5 text-red-200">
                                released
                              </span>
                            ) : (
                              <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                                pending
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            {released ? (
                              <form action={unrelease}>
                                <button className="text-xs text-zinc-400 hover:text-zinc-200">
                                  Un-release
                                </button>
                              </form>
                            ) : (
                              <form action={release}>
                                <button className="rounded bg-red-700 px-2 py-0.5 text-xs text-white hover:bg-red-600">
                                  Release
                                </button>
                              </form>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
