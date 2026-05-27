import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import TableFilter from "@/components/TableFilter";
import { SortableTableEnhancer } from "@/components/SortableTableEnhancer";
import { FilteredRosterButtons } from "@/components/FilteredRosterButtons";

import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug)
    return pageMetadata({
      title: "Roster not found",
      description: "This roster does not exist or is no longer available.",
    });
  const title = `Roster — ${season.league.name} ${season.name} ${season.year}`;
  return pageMetadata({
    title,
    description: `Driver list for ${season.league.name} ${season.name} ${season.year}.`,
    url: `/leagues/${slug}/seasons/${seasonId}/roster`,
  });
}


export default async function PublicSeasonRoster({
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

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          where: { status: { in: ["APPROVED", "PENDING"] } },
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
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.league.name} {season.name} {season.year}
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
                  <span className="ml-1 text-zinc-500">
                    ({pendingTotal} pending)
                  </span>
                )}
              </p>
            </div>
            {/* Team-mode keeps the server-side export route because
                the team table doesn't have the SortableTableEnhancer
                (sort would break team grouping). The client-side
                FilteredRosterButtons requires data-r-<col> rows. */}
            <PublicRosterExportButtons slug={slug} seasonId={seasonId} />
          </div>
        </div>

        {teamsWithRegs.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No teams registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm freeze-driver-col">
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
                </tr>
              </thead>
              <tbody>
                {teamsWithRegs.flatMap((team) =>
                  team.registrations.map((reg, ri) => (
                    <tr
                      key={reg.id}
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
                          <div className="font-semibold text-zinc-100">
                            {team.name}
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
                            <>
                              {reg.user.firstName} {reg.user.lastName}
                            </>
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
                        {reg.status === "PENDING" && (
                          <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            Pending
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.carClass?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.car?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.user.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">{reg.iRating ?? "—"}</td>
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={reg.iracingInvitationSent}
                          labels={{ YES: "Sent", NO: "Not sent" }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={reg.iracingInvitationAccepted}
                          labels={{ YES: "Accepted", NO: "Not accepted" }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }


  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: { in: ["APPROVED", "PENDING"] } },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { carClass: { displayOrder: "asc" } },
      { startNumber: "asc" },
      { user: { lastName: "asc" } },
    ],
  });

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
  // Driver Class (Pro/Am) column for Pro/Am seasons; the car-class "Class"
  // column only for genuine multi-car-class seasons (e.g. IEC).
  const showProAm = season.proAmEnabled || proAmIsClass;
  const showClass = season.isMulticlass && !proAmIsClass;
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;
  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name} {season.year}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Roster</h1>
            <p className="mt-1 text-sm text-zinc-400">
              {registrations.length}{" "}
              {registrations.length === 1 ? "driver" : "drivers"}
              {pendingCount > 0 && (
                <span className="ml-1 text-zinc-500">
                  ({pendingCount} pending)
                </span>
              )}
            </p>
          </div>
          <FilteredRosterButtons
            tableId="publicRosterTable"
            filenameBase={`roster-${slug}-${season.name.replace(/\s+/g, "-")}-${season.year}`}
          />
        </div>
      </div>

      {registrations.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No drivers registered yet.
        </p>
      ) : (
        <>
          <TableFilter
            tableId="publicRosterTable"
            placeholder="Filter drivers by name, iRacing ID, team, car…"
          />
          <SortableTableEnhancer tableId="publicRosterTable" />
          {/* Freeze the first (Driver) column when scrolling
              horizontally. position: sticky needs an opaque background
              per cell, so we set explicit bgs here (zinc-900 for header,
              zinc-950 for body, zinc-900 on row hover). The filter row
              injected by SortableTableEnhancer lives in <thead> too, so
              its first <th> picks up the same rule automatically. */}
          <style>{`
            #publicRosterTable thead th:first-child,
            #publicRosterTable tbody td:first-child {
              position: sticky;
              left: 0;
            }
            #publicRosterTable thead th:first-child {
              background-color: rgb(24 24 27);
              z-index: 2;
            }
            #publicRosterTable tbody td:first-child {
              background-color: rgb(9 9 11);
              z-index: 1;
            }
            #publicRosterTable tbody tr:hover td:first-child {
              background-color: rgb(24 24 27);
            }
            /* Print / Save-as-PDF mode: hide UI chrome, switch the
               table to a light theme. Filtered rows already have
               display:none, so the PDF only includes visible ones. */
            @media print {
              @page { size: A4 landscape; margin: 10mm; }
              html, body { background: white !important; color: #111 !important; }
              .no-print, nav, header { display: none !important; }
              #publicRosterTable tr.cw-filter-row { display: none !important; }
              #publicRosterTable .cw-sort-ind { display: none !important; }
              #publicRosterTable, #publicRosterTable thead, #publicRosterTable tbody,
              #publicRosterTable tr, #publicRosterTable th, #publicRosterTable td {
                background: white !important;
                color: #111 !important;
                border-color: #ddd !important;
              }
              #publicRosterTable thead th:first-child,
              #publicRosterTable tbody td:first-child,
              #publicRosterTable tbody tr:hover td:first-child {
                background: white !important;
                position: static !important;
              }
            }
          `}</style>
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table id="publicRosterTable" className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  {/* Driver first so the sticky-first-column freeze
                      pins the driver name as you scroll right. */}
                  <th data-col="name" className="px-4 py-3 driver-col">Driver</th>
                  <th data-col="num" className="px-4 py-3">#</th>
                  <th data-col="irid" className="px-4 py-3">iRacing ID</th>
                  <th data-col="team" className="px-4 py-3">Team</th>
                  {showClass && <th data-col="class" className="px-4 py-3">Class</th>}
                  {showProAm && <th data-col="proam" className="px-4 py-3">Pro/Am</th>}
                  <th data-col="car" className="px-4 py-3">Car</th>
                  {showFee && (
                    <th data-col="fee" className="px-4 py-3">Fee</th>
                  )}
                  <th data-col="invsent" className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Invite
                  </th>
                  <th data-col="invaccepted" className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Accepted
                  </th>
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
                      r.startNumber,
                      r.team?.name,
                      r.carClass?.name,
                      r.proAmClass,
                      r.car?.name,
                    ]
                      .filter((x) => x != null && x !== "")
                      .join(" ")
                      .toLowerCase()}
                    // Display-form values for the SortableTableEnhancer
                    // (it lowercases at compare time) + the client-side
                    // FilteredRosterButtons CSV exporter.
                    data-r-name={`${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim()}
                    data-r-num={r.startNumber ?? ""}
                    data-r-irid={r.user.iracingMemberId ?? ""}
                    data-r-team={r.team?.name ?? "Independent"}
                    data-r-class={r.carClass?.name ?? ""}
                    data-r-proam={r.proAmClass ?? ""}
                    data-r-car={r.car?.name ?? ""}
                    data-r-fee={r.startingFeePaid === "YES" ? "Paid" : r.startingFeePaid === "NO" ? "Not paid" : "Pending"}
                    data-r-invsent={r.iracingInvitationSent === "YES" ? "Sent" : r.iracingInvitationSent === "NO" ? "Not sent" : "Pending"}
                    data-r-invaccepted={r.iracingInvitationAccepted === "YES" ? "Accepted" : r.iracingInvitationAccepted === "NO" ? "Not accepted" : "Pending"}
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
                          <>
                            {r.user.firstName} {r.user.lastName}
                          </>
                        )}
                      </div>
                      {r.status === "PENDING" && (
                        <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                          Pending
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.user.iracingMemberId ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.team?.name ?? "Independent"}
                    </td>
                    {showClass && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {showProAm && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.proAmClass ?? "—"}
                      </td>
                    )}
                    <td className="px-4 py-3 text-zinc-400">
                      {r.car?.name ?? "—"}
                    </td>
                    {showFee && (
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={r.startingFeePaid}
                          labels={{ YES: "Paid", NO: "Not paid" }}
                        />
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <FlagBadge
                        value={r.iracingInvitationSent}
                        labels={{ YES: "Sent", NO: "Not sent" }}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <FlagBadge
                        value={r.iracingInvitationAccepted}
                        labels={{ YES: "Accepted", NO: "Not accepted" }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Public-side roster export buttons. CSV is a plain anchor that hits
 * the public GET export route (no auth gate). Print opens the public
 * printable view in a new tab.
 */
function PublicRosterExportButtons({
  slug,
  seasonId,
}: {
  slug: string;
  seasonId: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <a
        href={`/leagues/${slug}/seasons/${seasonId}/roster/export`}
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Comma-separated values. Opens in Google Sheets, Excel, Numbers."
      >
        Download CSV
      </a>
      <a
        href={`/leagues/${slug}/seasons/${seasonId}/roster/print`}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-700"
        title="Print-friendly view in a new tab. Use the browser's print dialog → 'Save as PDF'."
      >
        Print / Save as PDF
      </a>
    </div>
  );
}

function FlagBadge({
  value,
  labels,
}: {
  value: "PENDING" | "YES" | "NO";
  labels: { YES: string; NO: string };
}) {
  const safe = value === "PENDING" ? "NO" : value;
  const cls =
    safe === "YES"
      ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
      : "border-red-800/50 bg-red-950/40 text-red-200";
  const text = safe === "YES" ? labels.YES : labels.NO;
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs ${cls}`}
    >
      {text}
    </span>
  );
}
