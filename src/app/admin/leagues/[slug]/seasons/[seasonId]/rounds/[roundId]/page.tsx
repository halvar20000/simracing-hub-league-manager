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
  searchParams: Promise<{ imported?: string; skipped?: string; cls?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const { imported, skipped, cls: clsRaw } = await searchParams;
  type Cls = "combined" | "pro" | "am" | "team";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :
    clsRaw === "am" ? "am" :
    clsRaw === "team" ? "team" : "combined";
  const baseHref = `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;

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

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        <Link
          href={baseHref}
          className={`rounded px-3 py-1.5 ${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
        >
          Combined
        </Link>
        {round.season.isMulticlass && (
          <>
            <Link
              href={`${baseHref}?cls=pro`}
              className={`rounded px-3 py-1.5 ${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              Pro
            </Link>
            <Link
              href={`${baseHref}?cls=am`}
              className={`rounded px-3 py-1.5 ${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
            >
              Am
            </Link>
          </>
        )}
        <Link
          href={`${baseHref}?cls=team`}
          className={`rounded px-3 py-1.5 ${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}`}
        >
          Team
        </Link>
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
          <AdminRegList
            registrations={registrations}
            cls={cls}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            isMulticlass={round.season.isMulticlass}
          />
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
    carClass: { name: string; shortCode: string } | null;
    raceResults: Array<{
      id: string;
      finishPosition: number;
      lapsCompleted: number;
      raceDistancePct: number;
      totalTimeMs: number | null;
      bestLapTimeMs: number | null;
      incidents: number;
      startPosition: number | null;
      qualifyingTimeMs: number | null;
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
          label="Grid"
          name="startPosition"
          type="number"
          defaultValue={result?.startPosition != null ? String(result.startPosition) : ""}
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
          label="Quali"
          name="qualifyingTime"
          type="text"
          defaultValue={formatMsToTime(result?.qualifyingTimeMs)}
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

function AdminRegList({
  registrations,
  cls,
  slug,
  seasonId,
  roundId,
  isMulticlass,
}: {
  registrations: Array<Parameters<typeof ResultRow>[0]["reg"]>;
  cls: "combined" | "pro" | "am" | "team";
  slug: string;
  seasonId: string;
  roundId: string;
  isMulticlass: boolean;
}) {
  // Class filter
  let filtered = registrations;
  if (cls === "pro") {
    filtered = registrations.filter(
      (r) => r.carClass?.shortCode === "PRO"
    );
  } else if (cls === "am") {
    filtered = registrations.filter(
      (r) => r.carClass?.shortCode === "AM"
    );
  }

  if (cls !== "team") {
    if (filtered.length === 0) {
      return (
        <p className="text-sm text-zinc-500">No drivers in this view.</p>
      );
    }
    return (
      <div className="space-y-3">
        {filtered.map((reg) => (
          <ResultRow
            key={reg.id}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            reg={reg}
            isMulticlass={isMulticlass}
          />
        ))}
      </div>
    );
  }

  // Team view: group by team name, expandable per team
  const byTeam = new Map<
    string,
    typeof registrations
  >();
  for (const reg of registrations) {
    const key = reg.team?.name ?? "Independent";
    const arr = byTeam.get(key);
    if (arr) arr.push(reg);
    else byTeam.set(key, [reg]);
  }
  const groups = [...byTeam.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div className="space-y-3">
      {groups.map(([teamName, regs]) => (
        <details
          key={teamName}
          className="overflow-hidden rounded border border-zinc-800"
          open={cls === "team"}
        >
          <summary className="flex cursor-pointer items-center gap-3 bg-zinc-900 px-3 py-2 hover:bg-zinc-800">
            <span className="flex-1 font-medium">{teamName}</span>
            <span className="text-xs text-zinc-500">
              {regs.length} {regs.length === 1 ? "driver" : "drivers"}
            </span>
          </summary>
          <div className="space-y-3 p-3">
            {regs.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={isMulticlass}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
