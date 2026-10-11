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
  deleteIncidentReport,
  updateIncidentReport,
} from "@/lib/actions/admin-reports";
import { InvolvedDriversPicker } from "@/components/InvolvedDriversPicker";
import { InvolvedTeamsPicker } from "@/components/InvolvedTeamsPicker";
import { loadRoundCars } from "@/lib/round-cars";
import { SessionAndTimestampFields } from "@/components/SessionAndTimestampFields";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import {
  PenaltyRowsEditor,
  type PenaltyDriverOption,
} from "@/components/PenaltyRowsEditor";

// CAS uses penalty points as the only penalty type. The stewarding form offers
// just "No action" (incident cleared, no penalty) and "Strafpunkte" (points
// deduction). The other FinishStatus/Verdict enum values still exist for any
// historical decisions but are no longer selectable here.
const VERDICTS = [
  { value: "NO_ACTION", label: "Kein Vergehen (No action)" },
  { value: "POINTS_DEDUCTION", label: "Strafpunkte (Penalty-Points)" },
  { value: "DISQUALIFICATION", label: "Disqualifikation (DSQ)" },
];

export default async function AdminReportDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; reportId: string }>;
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const viewer = await requireSteward();
  const isAdmin = viewer.role === "ADMIN";
  const { slug, seasonId, reportId } = await params;
  const { error, notice } = await searchParams;

  const report = await prisma.incidentReport.findUnique({
    where: { id: reportId },
    include: {
      round: {
        include: {
          season: {
            include: {
              league: true,
              scoringSystem: true,
            },
          },
        },
      },
      reporterUser: true,
      reporterRegistration: {
        include: { user: true, team: { select: { name: true } } },
      },
      involvedDrivers: {
        include: {
          registration: {
            include: {
              user: true,
              team: { select: { name: true } },
            },
          },
        },
      },
      involvedTeams: { include: { team: { select: { id: true, name: true } } } },
      evidence: true,
      decision: { include: { penalties: true } },
    },
  });
  if (!report || report.round.season.league.slug !== slug) notFound();

  const teamMode = !!report.round.season.teamRegistration;
  const racesPerRound = report.round.season.scoringSystem.racesPerRound ?? 1;

  const accusedDrivers = report.involvedDrivers.filter(
    (d) => d.role === "ACCUSED"
  );

  // Team-mode seasons (IEC): the cars of this round and their crews. The
  // accused TEAMS come from involvedTeams; reports filed before v2.39.0 have
  // none — there the reporter ticked a team and every member REGISTERED with
  // it was tagged, so the team is the accused drivers' registered team (not
  // the car they sat in: with mixed crews that would name a second team).
  const roundCars = teamMode
    ? await loadRoundCars(prisma, report.roundId, report.round.seasonId)
    : [];
  const accusedTeams: { teamId: string; teamName: string; driverRegIds: string[] }[] =
    [];
  if (teamMode) {
    const teamName = (id: string) =>
      report.involvedTeams.find((t) => t.teamId === id)?.team.name ??
      roundCars.find((c) => c.teamId === id)?.teamName ??
      accusedDrivers.find((d) => d.registration.teamId === id)?.registration.team
        ?.name ??
      "(Team)";
    const ids =
      report.involvedTeams.length > 0
        ? report.involvedTeams.filter((t) => t.role === "ACCUSED").map((t) => t.teamId)
        : [
            ...new Set(
              accusedDrivers
                .map((d) => d.registration.teamId)
                .filter((x): x is string => !!x)
            ),
          ];
    for (const id of ids) {
      const stored = report.involvedTeams.find((t) => t.teamId === id);
      accusedTeams.push({
        teamId: id,
        teamName: teamName(id),
        driverRegIds: stored
          ? stored.registrationId
            ? [stored.registrationId]
            : []
          : accusedDrivers
              .filter((d) => d.registration.teamId === id)
              .map((d) => d.registrationId),
      });
    }
  }

  const categoryPointsTable = readCategoryPoints(
    report.round.season.scoringSystem.categoryPointsTable
  );

  // Build the pool of selectable penalty recipients: every driver who has a
  // result in this round, plus everyone already involved in the report
  // (accused + reporter). Any of them can receive a penalty point.
  const roundResults = await prisma.raceResult.findMany({
    where: { roundId: report.roundId },
    orderBy: [{ raceNumber: "asc" }, { finishPosition: "asc" }],
    select: {
      id: true,
      raceNumber: true,
      finishPosition: true,
      finishStatus: true,
      dsqDecisionId: true,
      registration: {
        select: {
          id: true,
          startNumber: true,
          user: { select: { firstName: true, lastName: true } },
          team: { select: { name: true } },
        },
      },
    },
  });

  type RegLike = {
    id: string;
    startNumber: string | null;
    user: { firstName: string | null; lastName: string | null };
    team: { name: string } | null;
  };
  const driverMap = new Map<string, PenaltyDriverOption & { sort: number }>();
  const addOpt = (reg: RegLike | null | undefined) => {
    if (!reg || driverMap.has(reg.id)) return;
    const name = `${reg.user.firstName ?? ""} ${reg.user.lastName ?? ""}`.trim();
    const numPart = reg.startNumber ? `#${reg.startNumber} ` : "";
    const teamPart = teamMode && reg.team?.name ? ` — ${reg.team.name}` : "";
    driverMap.set(reg.id, {
      registrationId: reg.id,
      label: `${numPart}${name || "(ohne Name)"}${teamPart}`,
      sort: reg.startNumber ? parseInt(reg.startNumber, 10) || 9999 : 9999,
    });
  };
  roundResults.forEach((r) => addOpt(r.registration as RegLike));
  report.involvedDrivers.forEach((d) => addOpt(d.registration as RegLike));
  addOpt(report.reporterRegistration as RegLike | null);

  const driverOptions: PenaltyDriverOption[] = teamMode
    ? (() => {
        // IEC: drivers grouped by the car they sat in this round, accused
        // cars first. Anyone not in a car (e.g. the reporter before results
        // exist) goes to a trailing group.
        const accusedIds = new Set(accusedTeams.map((t) => t.teamId));
        const cars = [...roundCars].sort(
          (a, b) =>
            Number(accusedIds.has(b.teamId)) - Number(accusedIds.has(a.teamId)) ||
            a.teamName.localeCompare(b.teamName)
        );
        const opts: PenaltyDriverOption[] = [];
        const placed = new Set<string>();
        for (const c of cars) {
          const group = `${c.teamName}${c.classLabel ? ` (${c.classLabel})` : ""}`;
          for (const m of c.crew) {
            opts.push({ registrationId: m.registrationId, label: `${m.label} — ${c.teamName}`, group });
            placed.add(m.registrationId);
          }
        }
        for (const o of driverMap.values()) {
          if (!placed.has(o.registrationId))
            opts.push({ registrationId: o.registrationId, label: o.label, group: "Weitere Fahrer" });
        }
        return opts;
      })()
    : Array.from(driverMap.values())
        .sort((a, b) => a.sort - b.sort || a.label.localeCompare(b.label))
        .map(({ registrationId, label }) => ({ registrationId, label }));

  // Disqualification picker: every result of this round, accused drivers
  // first so the usual case is one click. `checked` marks the results THIS
  // decision already disqualified — unticking one and saving puts it back.
  const accusedRegIds = new Set(
    accusedDrivers.map((d) => d.registration.id)
  );
  const dsqChoices = [...roundResults]
    .sort((a, b) => {
      const aAcc = accusedRegIds.has(a.registration.id) ? 0 : 1;
      const bAcc = accusedRegIds.has(b.registration.id) ? 0 : 1;
      return (
        aAcc - bAcc ||
        a.raceNumber - b.raceNumber ||
        a.finishPosition - b.finishPosition
      );
    })
    .map((r) => {
      const name = `${r.registration.user.firstName ?? ""} ${r.registration.user.lastName ?? ""}`.trim();
      const num = r.registration.startNumber
        ? `#${r.registration.startNumber} `
        : "";
      const race = racesPerRound > 1 ? `R${r.raceNumber} ` : "";
      const pos =
        r.finishStatus === "CLASSIFIED"
          ? `P${r.finishPosition}`
          : r.finishStatus;
      return {
        id: r.id,
        label: `${num}${name || "(ohne Name)"} — ${race}${pos}`,
        accused: accusedRegIds.has(r.registration.id),
        checked: r.dsqDecisionId === report.decision?.id,
        alreadyDsq: r.finishStatus === "DSQ",
      };
    });

  const initialPenaltyRows = (report.decision?.penalties ?? [])
    .filter(
      (p) => p.type === "POINTS_DEDUCTION" || p.type === "SPECIAL_MEASURE"
    )
    .map((p) => ({
      registrationId: p.registrationId,
      level: p.categoryLevel != null ? String(p.categoryLevel) : "",
      reason: p.reason ?? "",
      specialMeasure: p.specialMeasure ?? "",
    }));

  // ---- Admin edit of the report itself ------------------------------------
  // Roster for the accused picker: every approved driver of the season, plus
  // whoever is accused right now even if their registration has since been
  // withdrawn — otherwise opening and saving the form would drop them.
  const editRoster = isAdmin
    ? await prisma.registration.findMany({
        where: {
          seasonId: report.round.seasonId,
          OR: [
            { status: "APPROVED" },
            { id: { in: accusedDrivers.map((d) => d.registrationId) } },
          ],
        },
        include: {
          user: {
            select: { firstName: true, lastName: true, countryCode: true },
          },
          team: { select: { id: true, name: true } },
        },
        orderBy: [{ startNumber: "asc" }],
      })
    : [];
  const editDriverChoices = editRoster.map((r) => ({
    registrationId: r.id,
    startNumber: r.startNumber,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    countryCode: r.user.countryCode,
    teamId: r.team?.id ?? null,
    teamName: r.team?.name ?? null,
  }));
  const editSessionOptions =
    racesPerRound > 1
      ? [
          { value: "QUALIFYING", label: "Qualifying" },
          { value: "RACE_1", label: "Heat 1 / Race 1" },
          { value: "RACE_2", label: "Feature / Race 2" },
        ]
      : [
          { value: "QUALIFYING", label: "Qualifying" },
          { value: "RACE", label: "Race" },
        ];
  // Keep a stored session that the current format no longer offers.
  if (
    report.session &&
    !editSessionOptions.some((o) => o.value === report.session)
  ) {
    editSessionOptions.push({ value: report.session, label: report.session });
  }
  const updateReport = updateIncidentReport.bind(
    null,
    slug,
    seasonId,
    reportId
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
  const deleteReport = deleteIncidentReport.bind(null, slug, seasonId, reportId);

  return (
    <div className="space-y-6">
      <Link
        href={`/admin/leagues/${slug}/seasons/${seasonId}/reports`}
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← Meldungsübersicht
      </Link>

      <div>
        <h1 className="text-2xl font-bold">Vorfallmeldung</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Rennen {report.round.roundNumber} {report.round.name} • Eingereicht{" "}
          {formatDateTime(report.submittedAt)} • Status:{" "}
          <StatusBadge status={report.status} />
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {notice && (
        <div
          className={`rounded border p-3 text-sm ${
            notice.includes("Achtung")
              ? "border-amber-700 bg-amber-950/40 text-amber-200"
              : "border-emerald-800 bg-emerald-950/40 text-emerald-200"
          }`}
        >
          {notice}
        </div>
      )}

      <section className="rounded border border-zinc-800 bg-zinc-900/60 p-4">
        <div className="flex flex-wrap items-baseline gap-x-8 gap-y-3">
          <div>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Replay-Zeitstempel
            </span>
            <div className="font-mono text-2xl font-bold text-amber-200">
              {report.replayTimestamp ?? "—"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Session
            </span>
            <div className="text-base text-zinc-200">
              {report.session ?? "—"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Runde
            </span>
            <div className="text-base text-zinc-200">
              {report.lapNumber ?? "—"}
            </div>
          </div>
          <div>
            <span className="text-[10px] uppercase tracking-widest text-zinc-500">
              Kurve / Sektor
            </span>
            <div className="text-base text-zinc-200">
              {report.turnOrSector ?? "—"}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Melder
          </h2>
          <p className="mt-1 font-medium">
            {report.stewardInitiated ? (
              <>
                Rennleitung (League stewards)
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  erfasst von {report.reporterUser.firstName}{" "}
                  {report.reporterUser.lastName}
                </span>
              </>
            ) : (
              <>
                {report.reporterUser.firstName} {report.reporterUser.lastName}
                {teamMode && report.reporterRegistration?.team?.name && (
                  <span className="ml-2 text-zinc-400">
                    — {report.reporterRegistration.team.name}
                  </span>
                )}
              </>
            )}
          </p>
          {report.lapNumber != null && (
            <p className="text-sm text-zinc-400">Runde {report.lapNumber}</p>
          )}
          {report.turnOrSector && (
            <p className="text-sm text-zinc-400">{report.turnOrSector}</p>
          )}
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Beschuldigt
          </h2>
          {teamMode && accusedTeams.length > 0 ? (
            <ul className="space-y-2 text-sm">
              {accusedTeams.map((t) => {
                const named = report.involvedDrivers.filter((d) =>
                  t.driverRegIds.includes(d.registrationId)
                );
                return (
                  <li key={t.teamId}>
                    <div className="font-semibold text-zinc-200">{t.teamName}</div>
                    <div className="ml-4 text-zinc-400">
                      {report.involvedTeams.length === 0
                        ? // Legacy report: every registered member was tagged.
                          named
                            .map((d) =>
                              `${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim()
                            )
                            .join(", ") || "—"
                        : named.length > 0
                          ? `Fahrer: ${named
                              .map((d) =>
                                `${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim()
                              )
                              .join(", ")}`
                          : "Fahrer nicht angegeben"}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : accusedDrivers.length === 0 ? (
            <p className="text-sm text-zinc-500">Keine Fahrer markiert.</p>
          ) : teamMode ? (
            <ul className="space-y-2 text-sm">
              {Array.from(
                accusedDrivers.reduce((map, d) => {
                  const key = d.registration.team?.name ?? "(Kein Team)";
                  const arr = map.get(key) ?? [];
                  arr.push(d);
                  map.set(key, arr);
                  return map;
                }, new Map<string, typeof accusedDrivers>())
              ).map(([teamName, members]) => (
                <li key={teamName}>
                  <div className="font-semibold text-zinc-200">{teamName}</div>
                  <ul className="ml-4 space-y-0.5 text-zinc-400">
                    {members.map((d) => (
                      <li key={d.id}>
                        {d.registration.user.firstName}{" "}
                        {d.registration.user.lastName}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
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
          Beschreibung
        </h2>
        <div className="whitespace-pre-wrap rounded border border-zinc-800 bg-zinc-900 p-3 text-sm">
          {report.description}
        </div>
      </section>

      {report.evidence.length > 0 && (
        <section>
          <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Beweise
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

      {isAdmin && (
        <details className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-zinc-200">
            ✏️ Meldung bearbeiten (Admin)
          </summary>
          <p className="mt-2 text-xs text-zinc-500">
            Korrigiert die Angaben des Melders — z. B. ein falsch gewähltes
            beschuldigtes Team. Das Urteil wird dabei nicht verändert: hat ein
            Fahrer, den du hier entfernst, im Urteil bereits eine Strafe, bleibt
            sie bestehen, bis du das Urteil anpasst.
          </p>
          <form action={updateReport} className="mt-4 space-y-4">
            <SessionAndTimestampFields
              sessionOptions={editSessionOptions}
              defaultSession={report.session ?? ""}
              defaultReplayTimestamp={report.replayTimestamp ?? ""}
              defaultOutside={report.outsideRaceIncident}
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">Runde</span>
                <input
                  name="lapNumber"
                  type="number"
                  min={1}
                  max={999}
                  defaultValue={report.lapNumber ?? ""}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">
                  Kurve / Sektor
                </span>
                <input
                  name="turnOrSector"
                  type="text"
                  defaultValue={report.turnOrSector ?? ""}
                  className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
            </div>
            <div>
              <span className="mb-1 block text-sm text-zinc-300">
                {teamMode ? "Beschuldigte(s) Team(s) / Auto(s)" : "Beschuldigte Fahrer"}
              </span>
              {teamMode ? (
                <>
                  <input type="hidden" name="teamPickerOnForm" value="1" />
                  <InvolvedTeamsPicker
                    lang="de"
                    cars={roundCars}
                    initialSelected={accusedTeams.map((t) => ({
                      teamId: t.teamId,
                      // Only a single named driver can be pre-selected; a
                      // legacy report that tagged the whole team names nobody.
                      registrationId:
                        report.involvedTeams.length > 0 && t.driverRegIds.length === 1
                          ? t.driverRegIds[0]
                          : null,
                    }))}
                  />
                </>
              ) : (
                <InvolvedDriversPicker
                  drivers={editDriverChoices}
                  excludeRegistrationId={report.reporterRegistrationId}
                  initialSelectedRegistrationIds={accusedDrivers.map(
                    (d) => d.registrationId
                  )}
                />
              )}
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Beschreibung <span className="text-orange-400">*</span>
              </span>
              <textarea
                name="description"
                required
                rows={5}
                defaultValue={report.description}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Beweis-Links (einer pro Zeile)
              </span>
              <textarea
                name="evidenceLinks"
                rows={3}
                defaultValue={report.evidence.map((e) => e.content).join("\n")}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <SubmitWithSpinner
              label="Meldung speichern"
              pendingLabel="Wird gespeichert…"
              className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
            />
          </form>
        </details>
      )}

      <section className="flex flex-wrap gap-2">
        {report.status === "SUBMITTED" && (
          <>
            <form action={setStatusUnderReview}>
              <button className="rounded bg-blue-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-600">
                In Prüfung nehmen
              </button>
            </form>
            <form action={setStatusDismissed}>
              <button className="rounded border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">
                Abweisen (kein Vergehen)
              </button>
            </form>
          </>
        )}
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900/40 p-5">
        <h2 className="font-display text-lg font-bold">
          {report.decision ? "Urteil bearbeiten" : "Urteil fällen"}
        </h2>
        <p className="text-xs text-zinc-500">
          Für Strafpunkte den beschuldigten Fahrer und den Wert wählen. Als
          Entwurf speichern (Häkchen aus) belässt die Meldung auf „In Prüfung“;
          Veröffentlichen setzt sie auf „Entschieden“ und zeigt das Urteil auf
          der öffentlichen Urteilsseite.
        </p>

        <form action={submit} className="mt-4 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Urteil</span>
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
              Öffentliche Zusammenfassung <span className="text-orange-400">*</span>
            </span>
            <textarea
              name="publicSummary"
              required
              rows={3}
              defaultValue={report.decision?.publicSummary ?? ""}
              placeholder="Wird auf der öffentlichen Urteilsseite angezeigt. Kurz und sachlich."
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Interne Notizen (nur Admin)
            </span>
            <textarea
              name="internalNotes"
              rows={2}
              defaultValue={report.decision?.internalNotes ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <PenaltyRowsEditor
            teamMode={teamMode}
            drivers={driverOptions}
            pointsTable={categoryPointsTable}
            initialRows={initialPenaltyRows}
          />
          <p className="text-xs text-zinc-500">
            Strafpunkte werden nur vergeben, wenn das Urteil „Strafpunkte“ ist.
            Die Kategorie pro Zeile bestimmt die Punktezahl gemäß der Tabelle
            dieses Wertungssystems; der Kommentar pro Zeile erscheint öffentlich
            neben dem jeweiligen Fahrer. <strong>Kategorie 4
            (Sondermaßnahme)</strong> ist davon unabhängig: sie zieht keine
            Punkte ab und wird bei <em>jedem</em> Urteil gespeichert und
            veröffentlicht.
          </p>

          <details
            open={dsqChoices.some((c) => c.checked)}
            className="rounded border border-red-900/60 bg-red-950/10 p-3"
          >
            <summary className="cursor-pointer text-sm font-semibold text-red-200">
              Disqualifikation — Ergebnisse auswählen
              {dsqChoices.filter((c) => c.checked).length > 0 && (
                <span className="ml-2 rounded bg-red-900/60 px-1.5 py-0.5 text-[10px] text-red-100">
                  {dsqChoices.filter((c) => c.checked).length} aktiv
                </span>
              )}
            </summary>
            <p className="mt-2 text-xs text-zinc-400">
              Wird <strong>nur</strong> angewendet, wenn das Urteil
              „Disqualifikation (DSQ)“ lautet. Das Ergebnis wird auf DSQ
              gesetzt, Rennpunkte und Teilnahmepunkte für dieses Rennen
              verfallen, und <strong>alle dahinter platzierten Fahrer rücken
              eine Position auf</strong> — die Wertung wird sofort neu
              berechnet. Häkchen wieder entfernen (oder das Urteil löschen)
              stellt den vorherigen Status wieder her.
              {racesPerRound > 1 &&
                " Bei Mehrrennen-Runden verfällt nur das ausgewählte Rennen."}
            </p>
            <div className="mt-3 grid max-h-72 gap-1 overflow-y-auto sm:grid-cols-2">
              {dsqChoices.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  Für diese Runde sind noch keine Ergebnisse importiert.
                </p>
              ) : (
                dsqChoices.map((c) => (
                  <label
                    key={c.id}
                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm ${
                      c.accused
                        ? "bg-zinc-800/80 text-zinc-100"
                        : "text-zinc-400"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="dsqResultIds"
                      value={c.id}
                      defaultChecked={c.checked}
                    />
                    <span>{c.label}</span>
                    {c.accused && (
                      <span className="rounded bg-amber-900/60 px-1 text-[10px] uppercase tracking-wider text-amber-200">
                        beschuldigt
                      </span>
                    )}
                    {c.alreadyDsq && !c.checked && (
                      <span className="rounded bg-zinc-700 px-1 text-[10px] uppercase tracking-wider text-zinc-300">
                        bereits DSQ
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>
          </details>

          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <input
              type="checkbox"
              name="publish"
              defaultChecked={report.decision?.publishedAt != null}
            />
            Veröffentlichen (als „Entschieden“ markieren und auf der öffentlichen Urteilsseite anzeigen)
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
            >
              Urteil speichern
            </button>
            {report.decision && (
              <form action={removeDecision}>
                <button
                  type="submit"
                  className="rounded border border-red-800 px-4 py-2 text-sm text-red-300 hover:bg-red-950"
                >
                  Urteil löschen
                </button>
              </form>
            )}
          </div>
        </form>
      </section>
      <section className="mt-8 rounded border border-red-900/60 bg-red-950/20 p-4">
        <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-red-300">
          Gefahrenzone
        </h2>
        <details className="mt-2">
          <summary className="cursor-pointer text-sm text-red-300 hover:text-red-200">
            Diese Meldung endgültig löschen
          </summary>
          <div className="mt-3 space-y-2">
            <p className="text-xs text-zinc-400">
              Dies entfernt die Meldung, ihre Beweise, Kommentare, beteiligten Fahrer, das Urteil und alle damit verbundenen Strafen. Der Strafpunkte-Pool wird neu berechnet. Diese Aktion kann nicht rückgängig gemacht werden.
            </p>
            <form action={deleteReport}>
              <SubmitWithSpinner
                label="Ja, diese Meldung endgültig löschen"
                pendingLabel="Wird gelöscht…"
                className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
              />
            </form>
          </div>
        </details>
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
  const labels: Record<string, string> = {
    SUBMITTED: "Eingereicht",
    UNDER_REVIEW: "In Prüfung",
    DECIDED: "Entschieden",
    DISMISSED: "Abgewiesen",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {labels[status] ?? status.replace("_", " ")}
    </span>
  );
}
