import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  approveRegistration,
  rejectRegistration,
  approveTeamRegistrations,
  rejectTeamRegistrations,
} from "@/lib/actions/admin-registrations";
import RegistrationFlagSelect from "@/components/RegistrationFlagSelect";
import RegistrationCarSelect from "@/components/RegistrationCarSelect";
import ProAmOverrideSelect from "@/components/ProAmOverrideSelect";
import GdcToggle from "@/components/GdcToggle";
import TableFilter from "@/components/TableFilter";
import { SortableTableEnhancer } from "@/components/SortableTableEnhancer";
import { FilteredRosterButtons } from "@/components/FilteredRosterButtons";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  // Cars for this season — used to populate the inline dropdown so admins
  // can set each driver's car from the roster page.
  const seasonCars = await prisma.car.findMany({
    where: { seasonId },
    orderBy: [
      { carClass: { displayOrder: "asc" } },
      { displayOrder: "asc" },
      { name: "asc" },
    ],
    select: { id: true, name: true },
  });

  // A season whose "car classes" are really just the Pro/Am tiers (legacy
  // GT3 WCT). When that is the case the car-class "Class" column duplicates
  // the dedicated Pro/Am column and is hidden.
  const seasonCarClasses = await prisma.carClass.findMany({
    where: { seasonId },
    select: { shortCode: true },
  });
  const proAmShortCodes = new Set(["PRO", "AM"]);
  const proAmIsClass =
    seasonCarClasses.length > 0 &&
    seasonCarClasses.every((c) =>
      proAmShortCodes.has(c.shortCode.toUpperCase())
    );
  // Driver Class (Pro/Am) — shown and editable inline for Pro/Am seasons so
  // admins can set each driver's tier straight from the roster.
  const showProAmColumn = season.proAmEnabled || proAmIsClass;
  // Car Class — hidden when the car classes are merely the Pro/Am tiers.
  const showClassColumn = !proAmIsClass;
  // GDC (Gentleman Driver Class) — opt-in parallel class, toggled per driver.
  const showGdcColumn = season.gdcEnabled;

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          include: { user: true, carClass: true, car: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const teamsWithRegs = teams.filter((t) => t.registrations.length > 0);
    const driverTotal = teamsWithRegs.reduce(
      (s, t) => s + t.registrations.length,
      0
    );
    const pendingTotal = teamsWithRegs.reduce(
      (s, t) =>
        s + t.registrations.filter((r) => r.status === "PENDING").length,
      0
    );
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.name} {season.year}
          </Link>
          <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Team roster</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {teamsWithRegs.length} team
                {teamsWithRegs.length === 1 ? "" : "s"}
                {" · "}
                {driverTotal} driver{driverTotal === 1 ? "" : "s"}
                {pendingTotal > 0 && (
                  <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                    {pendingTotal} pending
                  </span>
                )}
              </p>
            </div>
            <RosterExportButtons slug={slug} seasonId={seasonId} />
          </div>
        </div>

        {teamsWithRegs.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No teams registered yet.
          </p>
        ) : (
          <>
            <TableFilter tableId="teamRosterTable" placeholder="Filter by driver, team, car…" />
            <div className="overflow-x-auto rounded border border-zinc-800">
              <table id="teamRosterTable" className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3 driver-col">Driver</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Car</th>
                  <th className="px-4 py-3">iRacing ID</th>
                  <th className="px-4 py-3">iRating</th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Invite
                  </th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Accepted
                  </th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {teamsWithRegs.flatMap((team) =>
                  team.registrations.map((reg, ri) => (
                    <tr
                      key={reg.id}
                      data-filter={[
                        team.name,
                        reg.user.firstName,
                        reg.user.lastName,
                        reg.user.name,
                        reg.user.iracingMemberId,
                        reg.user.email,
                        reg.carClass?.name,
                        reg.car?.name,
                        reg.status,
                      ]
                        .filter((x) => x != null && x !== "")
                        .join(" ")
                        .toLowerCase()}
                      className={
                        ri === 0
                          ? "border-t-2 border-zinc-700 bg-zinc-950/40"
                          : "border-t border-zinc-800 hover:bg-zinc-900"
                      }
                    >
                      <td className="px-4 py-3 align-top text-zinc-400">
                        {ri === 0 ? fmtDate(team.createdAt) : ""}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {ri === 0 && (
                          <div className="space-y-1.5">
                            <div className="font-semibold text-zinc-100">
                              {team.name}
                            </div>
                            {team.registrations.some(
                              (rr) => rr.status === "PENDING"
                            ) && (
                              <div className="flex flex-wrap gap-1.5">
                                <form action={approveTeamRegistrations}>
                                  <input
                                    type="hidden"
                                    name="teamId"
                                    value={team.id}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-zinc-50 hover:bg-emerald-500"
                                  >
                                    Approve team
                                  </button>
                                </form>
                                <form action={rejectTeamRegistrations}>
                                  <input
                                    type="hidden"
                                    name="teamId"
                                    value={team.id}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/60"
                                  >
                                    Reject team
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 driver-col">
                        <div className="font-medium">
                          {reg.user.iracingMemberId ? (
                            <Link
                              href={`/drivers/${reg.user.iracingMemberId}`}
                              className="hover:text-orange-400"
                            >
                              {reg.user.firstName} {reg.user.lastName}
                            </Link>
                          ) : (
                            <>{reg.user.firstName} {reg.user.lastName}</>
                          )}
                          {ri === 0 && (
                            <span
                              className="ml-1 text-amber-400"
                              title="Team leader"
                            >
                              ★
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.carClass?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RegistrationCarSelect
                          registrationId={reg.id}
                          currentCarId={reg.carId}
                          cars={seasonCars}
                        />
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.user.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{reg.iRating ?? "—"}</td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationSent"
                          value={reg.iracingInvitationSent}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationAccepted"
                          value={reg.iracingInvitationAccepted}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={
                            reg.status === "APPROVED"
                              ? "rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200"
                              : reg.status === "PENDING"
                              ? "rounded bg-amber-900/40 px-2 py-0.5 text-amber-200"
                              : "rounded bg-zinc-800 px-2 py-0.5 text-zinc-400"
                          }
                        >
                          {reg.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }


  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const pendingCount = registrations.filter(
    (r) => r.status === "PENDING"
  ).length;
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Roster</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {registrations.length} registration
              {registrations.length === 1 ? "" : "s"}
              {pendingCount > 0 && (
                <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                  {pendingCount} pending
                </span>
              )}
            </p>
          </div>
          <FilteredRosterButtons
            tableId="rosterTable"
            filenameBase={`roster-${slug}-${season.name.replace(/\s+/g, "-")}-${season.year}`}
            extraColumns={[{ label: "Email", attr: "data-email" }]}
          />
        </div>
      </div>

      <TableFilter tableId="rosterTable" placeholder="Filter drivers by name, iRacing ID, team, car…" />
      <SortableTableEnhancer tableId="rosterTable" />

      {/*
        Freeze the first column (Driver) so it stays visible when the
        table scrolls horizontally. position:sticky needs an opaque
        background per cell (the thead's bg-zinc-900 doesn't paint
        behind the sticky cell at the scroll boundary), so we set
        explicit backgrounds here:
          - header first cell: zinc-900 (matches the thead)
          - body first cell:   zinc-950 (matches the page bg)
          - body first cell on row hover: zinc-900 (matches the row's
            hover:bg-zinc-900). Done in CSS instead of group-hover so
            we don't have to touch every <tr>.
        The injected filter row from SortableTableEnhancer lives in
        the <thead> too, so its first <th> picks up the same rule.
      */}
      <style>{`
        #rosterTable thead th:first-child,
        #rosterTable tbody td:first-child {
          position: sticky;
          left: 0;
        }
        #rosterTable thead th:first-child {
          background-color: rgb(24 24 27);  /* zinc-900 */
          z-index: 2;
        }
        #rosterTable tbody td:first-child {
          background-color: rgb(9 9 11);    /* zinc-950 */
          z-index: 1;
        }
        #rosterTable tbody tr:hover td:first-child {
          background-color: rgb(24 24 27);  /* zinc-900 — matches row hover */
        }
        /* Print / Save-as-PDF mode: hide UI chrome, switch to a clean
           light-theme table so the output is print-friendly. Rows that
           are already filtered out keep their display:none, so the PDF
           contains only the visible rows. */
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          html, body { background: white !important; color: #111 !important; }
          .no-print, nav, header { display: none !important; }
          /* Hide the SortableTableEnhancer's filter row + sort
             indicators — they're UI affordances, not data. */
          #rosterTable tr.cw-filter-row { display: none !important; }
          #rosterTable .cw-sort-ind { display: none !important; }
          /* Light-theme table. */
          #rosterTable, #rosterTable thead, #rosterTable tbody,
          #rosterTable tr, #rosterTable th, #rosterTable td {
            background: white !important;
            color: #111 !important;
            border-color: #ddd !important;
          }
          #rosterTable thead th:first-child,
          #rosterTable tbody td:first-child,
          #rosterTable tbody tr:hover td:first-child {
            background: white !important;
            position: static !important;
          }
        }
      `}</style>

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table id="rosterTable" className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th data-col="name" className="px-4 py-3 driver-col">Driver</th>
              <th data-col="irid" className="px-2 py-3 whitespace-nowrap">iR ID</th>
              <th data-col="irating" className="px-2 py-3 whitespace-nowrap">iRating</th>
              <th data-col="num" className="px-2 py-3">#</th>
              <th data-col="team" className="px-3 py-3">Team</th>
              {showClassColumn && (
                <th data-col="class" className="px-2 py-3">Class</th>
              )}
              <th data-col="car" className="px-4 py-3 min-w-[15rem]">Car</th>
              {showProAmColumn && <th data-col="proam" className="px-2 py-3">Pro/Am</th>}
              {showGdcColumn && <th data-col="gdc" className="px-2 py-3">GDC</th>}
              <th data-col="status" className="px-2 py-3">Status</th>
              {showFee && (
              <th data-col="fee" className="px-2 py-3">Fee</th>
              )}
              <th data-col="invsent" className="px-2 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">iRacing</div>
                Invite
              </th>
              <th data-col="invaccepted" className="px-2 py-3">
                <div className="text-[10px] uppercase tracking-wide text-zinc-500">iRacing</div>
                Accepted
              </th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr
                key={r.id}
                data-filter={[
                  r.user.firstName,
                  r.user.lastName,
                  r.user.name,
                  r.user.iracingMemberId,
                  r.user.iratingSportsCar,
                  r.iRating,
                  r.user.email,
                  r.startNumber,
                  r.team?.name,
                  r.carClass?.name,
                  r.car?.name,
                  r.proAmClass,
                  r.status,
                ]
                  .filter((x) => x != null && x !== "")
                  .join(" ")
                  .toLowerCase()}
                // Per-column sort / filter / CSV-export keys for
                // SortableTableEnhancer + FilteredRosterButtons. Stored
                // in display form (mixed case, friendly enum labels) —
                // the enhancer lowercases both sides at compare time so
                // the filter is still case-insensitive.
                data-r-name={`${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim()}
                data-r-irid={r.user.iracingMemberId ?? ""}
                data-r-irating={r.user.iratingSportsCar ?? r.iRating ?? ""}
                data-r-num={r.startNumber ?? ""}
                data-r-team={r.team?.name ?? ""}
                data-r-class={r.carClass?.name ?? ""}
                data-r-car={r.car?.name ?? ""}
                data-r-proam={r.proAmClass ?? ""}
                data-r-gdc={r.inGdc ? "GDC" : ""}
                data-r-status={r.status}
                data-r-fee={r.startingFeePaid === "YES" ? "Paid" : r.startingFeePaid === "NO" ? "Not paid" : "Pending"}
                data-r-invsent={r.iracingInvitationSent === "YES" ? "Sent" : r.iracingInvitationSent === "NO" ? "Not sent" : "Pending"}
                data-r-invaccepted={r.iracingInvitationAccepted === "YES" ? "Accepted" : r.iracingInvitationAccepted === "NO" ? "Not accepted" : "Pending"}
                data-email={r.user.email ?? ""}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3 driver-col">
                  <div className="font-medium">
                    {r.user.iracingMemberId ? (
                      <Link
                        href={`/drivers/${r.user.iracingMemberId}`}
                        className="hover:text-orange-400"
                      >
                        {r.user.firstName} {r.user.lastName}
                      </Link>
                    ) : (
                      <>{r.user.firstName} {r.user.lastName}</>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {r.user.email ?? r.user.name}
                  </div>
                </td>
                <td className="px-2 py-3 text-zinc-400 whitespace-nowrap tabular-nums">
                  {r.user.iracingMemberId ?? "—"}
                </td>
                <td className="px-2 py-3 text-zinc-400 whitespace-nowrap tabular-nums">
                  {r.user.iratingSportsCar ?? r.iRating ?? "—"}
                </td>
                <td className="px-2 py-3 text-zinc-400 tabular-nums">
                  {r.startNumber ?? "—"}
                </td>
                <td className="px-3 py-3 text-zinc-400">
                  {r.team?.name ?? "—"}
                </td>
                {showClassColumn && (
                  <td className="px-2 py-3 text-zinc-400">
                    {r.carClass?.name ?? "—"}
                  </td>
                )}
                <td className="px-4 py-3 min-w-[15rem]">
                  <RegistrationCarSelect
                    registrationId={r.id}
                    currentCarId={r.carId}
                    cars={seasonCars}
                  />
                </td>
                {showProAmColumn && (
                  <td className="px-2 py-3">
                    <ProAmOverrideSelect
                      registrationId={r.id}
                      value={r.proAmClass}
                    />
                  </td>
                )}
                {showGdcColumn && (
                  <td className="px-2 py-3">
                    <GdcToggle registrationId={r.id} value={r.inGdc} />
                  </td>
                )}
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                {showFee && (
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="startingFeePaid"
                    value={r.startingFeePaid}
                  />
                </td>
                )}
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationSent"
                    value={r.iracingInvitationSent}
                  />
                </td>
                <td className="px-4 py-3">
                  <RegistrationFlagSelect
                    registrationId={r.id}
                    field="iracingInvitationAccepted"
                    value={r.iracingInvitationAccepted}
                  />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <form
                          action={approveRegistration.bind(null, r.id)}
                        >
                          <button
                            type="submit"
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectRegistration.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                          >
                            Reject
                          </button>
                        </form>
                      </>
                    )}
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/roster/${r.id}/edit`}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={14}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * "Download CSV" + "Print / Save as PDF" buttons. CSV is a plain anchor
 * hitting the export GET route (browser triggers a download via the
 * Content-Disposition header). Print opens the printable view in a new
 * tab so the admin can fire Cmd+P → Save as PDF.
 */
function RosterExportButtons({
  slug,
  seasonId,
}: {
  slug: string;
  seasonId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/admin/leagues/${slug}/seasons/${seasonId}/roster/export`}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Comma-separated values. Opens in Google Sheets, Excel, Numbers."
      >
        Download CSV
      </a>
      <a
        href={`/admin/leagues/${slug}/seasons/${seasonId}/roster/print`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Opens a print-friendly view in a new tab. Use the browser's print dialog → 'Save as PDF'."
      >
        Print / Save as PDF
      </a>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-900 text-amber-200",
    APPROVED: "bg-emerald-900 text-emerald-200",
    REJECTED: "bg-red-900 text-red-200",
    WITHDRAWN: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
