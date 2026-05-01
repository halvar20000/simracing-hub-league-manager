import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { importResultsCsv } from "@/lib/actions/csv-import";
import { formatDateTime } from "@/lib/date";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";

export default async function ImportCsvPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const { error } = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      csvImports: {
        orderBy: { createdAt: "desc" },
        include: { uploadedBy: { select: { name: true, email: true } } },
        take: 5,
      },
    },
  });
  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const action = importResultsCsv.bind(null, slug, seasonId, roundId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to results
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import results from CSV</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Round {round.roundNumber} — {round.name}
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
        <p>
          Upload the CSV file exported from iRacing&apos;s league session
          results page. The parser detects column names automatically and
          matches each row to a registered driver by their{" "}
          <strong className="text-zinc-200">iRacing CustID</strong>.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Required columns:{" "}
          <code className="rounded bg-zinc-800 px-1">CustID</code> and{" "}
          <code className="rounded bg-zinc-800 px-1">Pos</code>. Optional:
          Laps, Inc, Total Time, Best Time, Out / Reason Out.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          Importing twice for the same round is safe — existing results for
          each driver are updated rather than duplicated.
        </p>
      </div>

      <form action={action} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">CSV file</span>
          <input
            type="file"
            name="file"
            accept=".csv,text/csv"
            required
            className="block w-full text-sm text-zinc-300 file:mr-4 file:rounded file:border-0 file:bg-zinc-800 file:px-4 file:py-2 file:text-sm file:text-zinc-100 hover:file:bg-zinc-700"
          />
        </label>
        <button
          type="submit"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Upload and import
        </button>
      </form>

      {round.csvImports.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recent imports</h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">By</th>
                  <th className="px-3 py-2">File</th>
                  <th className="px-3 py-2 text-right">Imported</th>
                  <th className="px-3 py-2 text-right">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {round.csvImports.map((imp) => (
                  <tr key={imp.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 text-zinc-400">
                      {formatDateTime(imp.createdAt)}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {imp.uploadedBy.name ?? imp.uploadedBy.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-zinc-400">
                      {imp.originalFilename}
                    </td>
                    <td className="px-3 py-2 text-right text-emerald-400">
                      {imp.rowsImported}
                    </td>
                    <td className="px-3 py-2 text-right text-amber-400">
                      {imp.rowsSkipped}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
