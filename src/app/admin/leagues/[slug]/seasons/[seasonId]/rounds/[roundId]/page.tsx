import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { upsertRaceResult } from "@/lib/actions/race-results";
import { formatMsToTime } from "@/lib/time";
import { pullResultsFromIRLM } from "@/lib/actions/irlm-import";
import { formatDateTime } from "@/lib/date";

export default async function AdminRoundResults({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ imported?: string; skipped?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const { imported, skipped } = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: {
        include: { league: true, scoringSystem: true },
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: true,
      team: true,
      carClass: true,
      raceResults: { where: { roundId } },
    },
    orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {round.season.name} {round.season.year}
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">
              Round {round.roundNumber} — {round.name}
            </h1>
            <p className="text-sm text-zinc-400">
              {round.track}
              {round.trackConfig ? ` (${round.trackConfig})` : ""} •{" "}
              {formatDateTime(round.startsAt)} •{" "}
              {round.status.replace("_", " ")}
            </p>
          </div>
          <div className="flex gap-2">
            {round.irlmEventId && round.season.irlmLeagueName && (
              <form action={pullResultsFromIRLM}>
                <input type="hidden" name="leagueSlug" value={slug} />
                <input type="hidden" name="seasonId" value={seasonId} />
                <input type="hidden" name="roundId" value={roundId} />
                <button
                  type="submit"
                  className="rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900"
                >
                  Pull from iRLM
                </button>
              </form>
            )}
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/import`}
              className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Import CSV
            </Link>
            <Link
              href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/edit`}
              className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
            >
              Edit round
            </Link>
          </div>
        </div>
      </div>

      {imported && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Imported {imported} row{imported === "1" ? "" : "s"}
          {skipped && Number(skipped) > 0
            ? `, skipped ${skipped} (likely no matching iRacing ID in roster)`
            : ""}
          .
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Scoring:{" "}
          <strong className="text-zinc-200">
            {round.season.scoringSystem.name}
          </strong>
          {" • "}
          Participation: {round.season.scoringSystem.participationPoints}{" "}
          points if ≥ {round.season.scoringSystem.participationMinDistancePct}%
          of race distance.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Points are recalculated automatically after each save or CSV import.
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Results — {registrations.length} approved driver
          {registrations.length === 1 ? "" : "s"}
        </h2>

        {registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No approved drivers yet. Approve registrations on the Roster tab
            first.
          </p>
        ) : (
          <div className="space-y-3">
            {registrations.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={round.season.isMulticlass}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ResultRow({
  slug,
  seasonId,
  roundId,
  reg,
  isMulticlass,
}: {
  slug: string;
  seasonId: string;
  roundId: string;
  reg: {
    id: string;
    startNumber: number | null;
    user: { firstName: string | null; lastName: string | null };
    team: { name: string } | null;
    carClass: { name: string } | null;
    raceResults: Array<{
      id: string;
      finishPosition: number;
      lapsCompleted: number;
      raceDistancePct: number;
      totalTimeMs: number | null;
      bestLapTimeMs: number | null;
      incidents: number;
      finishStatus: string;
      rawPointsAwarded: number;
      participationPointsAwarded: number;
      manualPenaltyPoints: number;
      manualPenaltyReason: string | null;
      notes: string | null;
    }>;
  };
  isMulticlass: boolean;
}) {
  const result = reg.raceResults[0];
  const action = upsertRaceResult.bind(null, slug, seasonId, roundId, reg.id);

  const totalPoints = result
    ? result.rawPointsAwarded +
      result.participationPointsAwarded -
      result.manualPenaltyPoints
    : 0;

  return (
    <form
      action={action}
      className="rounded border border-zinc-800 bg-zinc-900 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <span className="font-semibold">
            {reg.startNumber != null && (
              <span className="mr-2 text-zinc-500">#{reg.startNumber}</span>
            )}
            {reg.user.firstName} {reg.user.lastName}
          </span>
          <span className="ml-3 text-xs text-zinc-500">
            {reg.team?.name ?? "Independent"}
            {isMulticlass && reg.carClass && ` • ${reg.carClass.name}`}
          </span>
        </div>
        {result && (
          <div className="text-xs text-zinc-400">
            Points:{" "}
            <span className="font-bold text-orange-400">{totalPoints}</span>
            <span className="ml-1 text-zinc-600">
              ({result.rawPointsAwarded}+{result.participationPointsAwarded}
              {result.manualPenaltyPoints > 0 &&
                `−${result.manualPenaltyPoints}`}
              )
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
        <Field
          label="Finish status"
          name="finishStatus"
          type="select"
          defaultValue={result?.finishStatus ?? "CLASSIFIED"}
          options={["CLASSIFIED", "DNF", "DNS", "DSQ"]}
        />
        <Field
          label="Position"
          name="finishPosition"
          type="number"
          defaultValue={String(result?.finishPosition ?? "")}
          min={0}
          max={999}
        />
        <Field
          label="Laps"
          name="lapsCompleted"
          type="number"
          defaultValue={String(result?.lapsCompleted ?? 0)}
          min={0}
        />
        <Field
          label="Distance %"
          name="raceDistancePct"
          type="number"
          defaultValue={String(result?.raceDistancePct ?? 100)}
          min={0}
          max={100}
        />
        <Field
          label="Incidents"
          name="incidents"
          type="number"
          defaultValue={String(result?.incidents ?? 0)}
          min={0}
        />
        <Field
          label="Total time"
          name="totalTime"
          type="text"
          defaultValue={formatMsToTime(result?.totalTimeMs)}
          placeholder="1:23:45.678"
        />
        <Field
          label="Best lap"
          name="bestLapTime"
          type="text"
          defaultValue={formatMsToTime(result?.bestLapTimeMs)}
          placeholder="1:53.456"
        />
        <Field
          label="Penalty pts"
          name="manualPenaltyPoints"
          type="number"
          defaultValue={String(result?.manualPenaltyPoints ?? 0)}
          min={0}
        />
        <Field
          label="Penalty reason"
          name="manualPenaltyReason"
          type="text"
          defaultValue={result?.manualPenaltyReason ?? ""}
          placeholder="e.g. unsafe rejoin T3"
          wide
        />
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="submit"
          className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Save row
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  options,
  min,
  max,
  wide,
}: {
  label: string;
  name: string;
  type?: "text" | "number" | "select";
  defaultValue?: string;
  placeholder?: string;
  options?: string[];
  min?: number;
  max?: number;
  wide?: boolean;
}) {
  return (
    <label
      className={`block ${wide ? "col-span-2 md:col-span-3 lg:col-span-3" : ""}`}
    >
      <span className="mb-1 block text-xs text-zinc-400">{label}</span>
      {type === "select" && options ? (
        <select
          name={name}
          defaultValue={defaultValue}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          placeholder={placeholder}
          min={min}
          max={max}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        />
      )}
    </label>
  );
}
