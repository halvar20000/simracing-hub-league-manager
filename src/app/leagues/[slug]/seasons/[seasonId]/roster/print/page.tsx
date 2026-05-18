import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PrintTrigger } from "@/components/PrintTrigger";

/**
 * Public printable roster. No auth gate — same visibility as the
 * regular public roster page. Email / admin-only details are NOT
 * shown. Layout is the same A4-portrait, light-theme view used by the
 * admin print route, just trimmed down.
 */
export default async function PublicPrintRosterPage({
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

  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: { in: ["APPROVED", "PENDING"] } },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { team: { name: "asc" } },
      { carClass: { displayOrder: "asc" } },
      { startNumber: "asc" },
      { user: { lastName: "asc" } },
    ],
  });

  const heading = `${season.league.name} — ${season.name} ${season.year}`;
  const subheading = `Roster (${registrations.length} driver${registrations.length === 1 ? "" : "s"}) · ${new Date().toLocaleString()}`;

  const showClass = season.isMulticlass;

  // Team-mode → group by team.
  const grouped: { teamName: string | null; regs: typeof registrations }[] = [];
  if (season.teamRegistration) {
    const buckets = new Map<string, typeof registrations>();
    for (const r of registrations) {
      const key = r.team?.name ?? "(no team)";
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    for (const [teamName, regs] of buckets) grouped.push({ teamName, regs });
  }

  return (
    <div className="mx-auto max-w-[210mm] bg-white p-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 12mm 14mm 12mm; }
          html, body { background: white !important; color: #111 !important; }
          .no-print { display: none !important; }
          table { page-break-inside: auto; }
          tr    { page-break-inside: avoid; page-break-after: auto; }
          thead { display: table-header-group; }
        }
        @media screen { body { background: #fff; } }
      `}</style>

      <div className="no-print mb-4 flex items-center justify-between border-b border-zinc-200 pb-3">
        <a
          href={`/leagues/${slug}/seasons/${seasonId}/roster`}
          className="text-sm text-zinc-600 hover:text-zinc-900"
        >
          ← Back to roster
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
              <PublicRosterTable
                regs={regs}
                showTeamColumn={false}
                showClassColumn={true}
              />
            </section>
          ))
        )
      ) : registrations.length === 0 ? (
        <p className="text-sm text-zinc-500">No registrations.</p>
      ) : (
        <PublicRosterTable
          regs={registrations}
          showTeamColumn={false}
          showClassColumn={showClass}
        />
      )}
    </div>
  );
}

type Reg = Awaited<
  ReturnType<typeof prisma.registration.findMany>
>[number] & {
  user: {
    firstName: string | null;
    lastName: string | null;
    iracingMemberId: string | null;
  };
  team: { name: string } | null;
  carClass: { name: string } | null;
  car: { name: string } | null;
};

function PublicRosterTable({
  regs,
  showTeamColumn,
  showClassColumn,
}: {
  regs: Reg[];
  showTeamColumn: boolean;
  showClassColumn: boolean;
}) {
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="border-b-2 border-zinc-300 text-left">
          <th className="py-1.5 pr-2">Driver</th>
          <th className="py-1.5 pr-2">#</th>
          <th className="py-1.5 pr-2">iRacing ID</th>
          <th className="py-1.5 pr-2">iRating</th>
          {showTeamColumn && <th className="py-1.5 pr-2">Team</th>}
          {showClassColumn && <th className="py-1.5 pr-2">Class</th>}
          <th className="py-1.5 pr-2">Car</th>
        </tr>
      </thead>
      <tbody>
        {regs.map((r) => (
          <tr key={r.id} className="border-b border-zinc-200">
            <td className="py-1 pr-2">
              {[r.user.firstName, r.user.lastName].filter(Boolean).join(" ")}
            </td>
            <td className="py-1 pr-2 tabular-nums">{r.startNumber ?? ""}</td>
            <td className="py-1 pr-2 tabular-nums">
              {r.user.iracingMemberId ?? ""}
            </td>
            <td className="py-1 pr-2 tabular-nums">{r.iRating ?? ""}</td>
            {showTeamColumn && (
              <td className="py-1 pr-2">{r.team?.name ?? "—"}</td>
            )}
            {showClassColumn && (
              <td className="py-1 pr-2">{r.carClass?.name ?? ""}</td>
            )}
            <td className="py-1 pr-2">{r.car?.name ?? ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
