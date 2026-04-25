import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSeason } from "@/lib/actions/seasons";

export default async function NewSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) notFound();

  const scoringSystems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
  });

  const create = createSeason.bind(null, slug);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Season</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Season name</span>
          <input
            name="name"
            required
            placeholder="2026 Spring"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Year</span>
          <input
            name="year"
            type="number"
            required
            defaultValue={2026}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            name="scoringSystemId"
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="">Select scoring system…</option>
            {scoringSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="isMulticlass" />
          Multiclass season
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="proAmEnabled" />
          Pro/Am split enabled
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team scoring mode
          </span>
          <select
            name="teamScoringMode"
            defaultValue="SUM_BEST_N"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="NONE">None (no team standings)</option>
            <option value="SUM_ALL">Sum all drivers</option>
            <option value="SUM_BEST_N">Sum best N drivers per race</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Best-N value (only used with SUM_BEST_N)
          </span>
          <input
            name="teamScoringBestN"
            type="number"
            defaultValue={2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create Season
          </button>
          <Link
            href={`/admin/leagues/${slug}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
