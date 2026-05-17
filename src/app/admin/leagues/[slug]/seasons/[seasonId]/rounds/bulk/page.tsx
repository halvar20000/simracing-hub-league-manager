import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { bulkCreateRounds } from "@/lib/actions/rounds";

export default async function BulkAddRoundsPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;
  const { error } = await searchParams;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, _count: { select: { rounds: true } } },
  });
  if (!season || season.league.slug !== slug) notFound();

  const create = bulkCreateRounds.bind(null, slug, seasonId);

  const example = `# Lines starting with '#' are comments and ignored.
# Columns (TAB / pipe / comma): Name | Track | Config | Start (YYYY-MM-DD HH:MM) | Race length (min) | Counts?
# Name is optional — if empty we use "Round N — Track". Counts defaults to true.
Round 1 — Spa | Spa-Francorchamps | Grand Prix | 2026-06-15 19:00 | 60 | true
Round 2 — Monza | Monza |  | 2026-06-22 19:00 | 60 | true
 | Nürburgring | GP | 2026-06-29 19:00 | 90
 | Watkins Glen | Boot | 2026-07-06 19:00 | 60 | true`;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Bulk add rounds</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Paste a full season schedule in one shot. New rounds are
          appended; existing rounds are left alone. Round numbers
          auto-increment from the current highest
          {season._count.rounds > 0
            ? ` (next will be ${season._count.rounds + 1})`
            : " (starting at 1)"}
          .
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <form action={create} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Schedule (one round per line)
          </span>
          <textarea
            name="rows"
            rows={14}
            defaultValue=""
            placeholder={example}
            className="w-full rounded border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs text-zinc-100"
          />
          <span className="mt-2 block text-xs text-zinc-500">
            Separators: <span className="text-zinc-300">TAB</span> (paste
            from Google Sheets / Excel), <span className="text-zinc-300">|</span>{" "}
            (pipe) or <span className="text-zinc-300">,</span> (comma — only
            if the row has ≥ 3 commas, since track names can contain commas).
            Column order:{" "}
            <span className="text-zinc-300">
              Name · Track · Config · Start · Race length · Counts?
            </span>
            . Required: Track and Start. Date format:{" "}
            <span className="text-zinc-300">YYYY-MM-DD HH:MM</span>{" "}
            (server local time, same as the date picker on the single-add
            form). Lines starting with <code>#</code> are ignored.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Add all rounds
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/new`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Single-add instead
          </Link>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>

      <details className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
        <summary className="cursor-pointer text-sm text-zinc-300">
          Example you can copy
        </summary>
        <pre className="mt-3 whitespace-pre-wrap rounded bg-zinc-950 p-3 font-mono text-xs text-zinc-300">
{example}
        </pre>
      </details>
    </div>
  );
}
