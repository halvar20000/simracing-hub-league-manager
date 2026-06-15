import { requireAdmin } from "@/lib/auth-helpers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/PrintTrigger";
import { getUserLiveIratingForLeague } from "@/lib/league-irating-category";
import { compareStartNumber } from "@/lib/start-number";

/**
 * Printable roster view. Light theme, compact table, no nav chrome —
 * the user hits Cmd+P (or the on-page button) and picks "Save as PDF"
 * in the browser's print dialog.
 *
 * For team-registration seasons, the table is grouped by team. For
 * solo seasons it's a single flat table sorted by class + start #.
 */
export default async function PrintRosterPage({
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

  // Same logic as the on-screen admin roster: when every CarClass is
  // PRO or AM (e.g. GT3 WCT) the dedicated Pro/Am column would just
  // repeat the Class column, so we hide it. Real multiclass leagues
  // (IEC) keep both because they're independent.
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
  const showProAmColumn = season.proAmEnabled && !proAmIsClass;

  const registrations = await prisma.registration.findMany({
    where: { seasonId, isTeamManager: false, status: { not: "WITHDRAWN" } },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { team: { name: "asc" } },
      { carClass: { displayOrder: "asc" } },
      { user: { lastName: "asc" } },
    ],
  });
  // Numeric-aware ordering by start number (text field, leading zeros allowed).
  registrations.sort((a, b) => {
    const at = a.team?.name ?? "";
    const bt = b.team?.name ?? "";
    if (at !== bt) return at.localeCompare(bt);
    const ao = a.carClass?.displayOrder ?? 9999;
    const bo = b.carClass?.displayOrder ?? 9999;
    if (ao !== bo) return ao - bo;
    const sn = compareStartNumber(a.startNumber, b.startNumber);
    if (sn !== 0) return sn;
    return (a.user.lastName ?? "").localeCompare(b.user.lastName ?? "");
  });

  const heading = `${season.league.name} — ${season.name} ${season.year}`;
  const subheading = `Roster (${registrations.length} driver${registrations.length === 1 ? "" : "s"}) · generated ${new Date().toLocaleString()}`;

  // Group by team for team seasons.
  const grouped: { teamName: string | null; regs: typeof registrations }[] = [];
  if (season.teamRegistration) {
    const buckets = new Map<string, typeof registrations>();
    for (const r of registrations) {
      const key = r.team?.name ?? "(no team)";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    for (const [teamName, regs] of buckets) {
      grouped.push({ teamName, regs });
    }
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:p-0">
      {/* Print-only CSS: light background, hide screen-only chrome */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
          html, body { background: white !important; color: #111 !important; }
          .no-print { display: none !important; }
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        @media screen {
          body { background: #fff; }
        }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between border-b border-zinc-200 pb-3">
        <a
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Back to admin roster
        </a>
        <PrintTrigger label="Print / Save as PDF" />
      </div>

      <header className="mb-4">
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="mt-1 text-xs text-zinc-600">{subheading}</p>
      </header>

      {season.teamRegistration ? (
        grouped.length === 0 ? (
          <p className="text-sm text-zinc-500">No registrations.</p>
        ) : (
          grouped.map(({ teamName, regs }) => (
            <section key={teamName ?? "no-team"} className="mb-6">
              <h2 className="mb-1.5 text-sm font-semibold uppercase tracking-wide text-zinc-700">
                {teamName}
              </h2>
              <RosterTable
                regs={regs}
                showTeamColumn={false}
                showProAmColumn={showProAmColumn}
                leagueSlug={slug}
              />
            </section>
          ))
        )
      ) : registrations.length === 0 ? (
        <p className="text-sm text-zinc-500">No registrations.</p>
      ) : (
        <RosterTable
          regs={registrations}
          showTeamColumn={false}
          showProAmColumn={showProAmColumn}
          leagueSlug={slug}
        />
      )}
    </div>
  );
}

type Reg = Awaited<
  ReturnType<typeof prisma.registration.findMany>
>[number] & {
  user: { firstName: string | null; lastName: string | null; iracingMemberId: string | null; iratingSportsCar: number | null; iratingFormulaCar: number | null; iratingOval: number | null; countryCode: string | null; email: string | null };
  team: { name: string } | null;
  carClass: { name: string } | null;
  car: { name: string } | null;
};

function RosterTable({
  regs,
  showTeamColumn,
  showProAmColumn,
  leagueSlug,
}: {
  regs: Reg[];
  showTeamColumn: boolean;
  showProAmColumn: boolean;
  leagueSlug: string;
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-zinc-300 text-left">
          {showTeamColumn && <th className="py-1.5 pr-2">Team</th>}
          <th className="py-1.5 pr-2">#</th>
          <th className="py-1.5 pr-2">Driver</th>
          <th className="py-1.5 pr-2">iRacing ID</th>
          <th className="py-1.5 pr-2">iRating</th>
          <th className="py-1.5 pr-2">Class</th>
          {showProAmColumn && <th className="py-1.5 pr-2">Pro/Am</th>}
          <th className="py-1.5 pr-2">Car</th>
          <th className="py-1.5 pr-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {regs.map((r) => (
          <tr key={r.id} className="border-b border-zinc-200">
            {showTeamColumn && (
              <td className="py-1 pr-2">{r.team?.name ?? "—"}</td>
            )}
            <td className="py-1 pr-2 tabular-nums">{r.startNumber ?? ""}</td>
            <td className="py-1 pr-2">
              {[r.user.firstName, r.user.lastName].filter(Boolean).join(" ")}
            </td>
            <td className="py-1 pr-2 tabular-nums">
              {r.user.iracingMemberId ?? ""}
            </td>
            <td className="py-1 pr-2 tabular-nums">{getUserLiveIratingForLeague(r.user, leagueSlug) ?? r.iRating ?? ""}</td>
            <td className="py-1 pr-2">{r.carClass?.name ?? ""}</td>
            {showProAmColumn && (
              <td className="py-1 pr-2">{r.proAmClass ?? ""}</td>
            )}
            <td className="py-1 pr-2">{r.car?.name ?? ""}</td>
            <td className="py-1 pr-2">{r.status}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
