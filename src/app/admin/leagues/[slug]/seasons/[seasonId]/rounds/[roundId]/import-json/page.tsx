import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { importIracingJson } from "@/lib/actions/iracing-json-import";

interface Props {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{
    error?: string;
    imported?: string;
    races?: string;
    unmatchedCount?: string;
    unmatched?: string;
  }>;
}

export default async function ImportIracingJsonPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const sp = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();

  const action = importIracingJson.bind(null, slug, seasonId, roundId);

  // Parse summary
  const imported = sp.imported ? parseInt(sp.imported, 10) : null;
  const races = sp.races ? parseInt(sp.races, 10) : null;
  const unmatchedCount = sp.unmatchedCount ? parseInt(sp.unmatchedCount, 10) : 0;
  const unmatchedList = sp.unmatched
    ? sp.unmatched.split("|").map((s) => {
        const [custId, ...nameParts] = s.split(":");
        return { custId, name: nameParts.join(":") };
      })
    : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Round {round.roundNumber} — {round.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import iRacing JSON</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload the <code className="text-zinc-300">eventresult-*.json</code> file
          downloaded from the iRacing subsession page. Existing race results
          for this round will be <strong>replaced</strong>.
        </p>
      </div>

      {sp.error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {sp.error}
        </div>
      )}

      {imported != null && (
        <div className="space-y-3">
          <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
            Imported <strong>{imported}</strong> result row
            {imported === 1 ? "" : "s"} across <strong>{races}</strong> race
            session{races === 1 ? "" : "s"}.
          </div>
          {unmatchedCount > 0 && (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
              <p className="font-medium">
                {unmatchedCount} driver{unmatchedCount === 1 ? "" : "s"} from the JSON
                {unmatchedCount === 1 ? " was" : " were"} not in the season roster
                and {unmatchedCount === 1 ? "was" : "were"} skipped:
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {unmatchedList.map((u) => (
                  <li key={u.custId}>
                    <span className="font-mono text-amber-300">#{u.custId}</span>{" "}
                    {u.name}
                  </li>
                ))}
                {unmatchedCount > unmatchedList.length && (
                  <li className="text-amber-300/70">
                    …and {unmatchedCount - unmatchedList.length} more
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs text-amber-200/80">
                Add these drivers to the roster (with their iRacing customer ID),
                then re-import the JSON to capture their results.
              </p>
            </div>
          )}
        </div>
      )}

      <form
        action={action}
        encType="multipart/form-data"
        className="space-y-4 rounded border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">
            iRacing event JSON file
          </span>
          <input
            type="file"
            name="jsonFile"
            accept="application/json,.json"
            required
            className="block w-full cursor-pointer rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 file:mr-3 file:rounded file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-orange-400"
          />
        </label>

        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">
            How does this work?
          </summary>
          <p className="mt-2">
            The parser reads <code>data.session_results</code> from the iRacing
            JSON. Sessions with <code>simsession_type=6</code> become race
            results (HEAT 1 → race 1, FEATURE → race 2). The session with{" "}
            <code>simsession_type=4</code> becomes the qualifying time. Drivers
            are matched against your roster via{" "}
            <code>User.iracingMemberId</code>. Times are converted from iRacing
            10000ths-of-a-second to milliseconds. After import, scoring is
            recomputed and standings are revalidated.
          </p>
        </details>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
          >
            Import & replace
          </button>
        </div>
      </form>
    </div>
  );
}
