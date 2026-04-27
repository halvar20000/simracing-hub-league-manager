import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSeason } from "@/lib/actions/seasons";

export default async function EditSeasonPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;

  const [season, scoringSystems] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: { league: true },
    }),
    prisma.scoringSystem.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!season || season.league.slug !== slug) notFound();

  const update = updateSeason.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Season</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Season name</span>
          <input
            name="name"
            required
            defaultValue={season.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Year</span>
          <input
            name="year"
            type="number"
            required
            defaultValue={season.year}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={season.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="DRAFT">Draft</option>
            <option value="OPEN_REGISTRATION">Open registration</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            name="scoringSystemId"
            defaultValue={season.scoringSystemId}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            {scoringSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="isMulticlass"
            defaultChecked={season.isMulticlass}
          />
          Multiclass season
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="proAmEnabled"
            defaultChecked={season.proAmEnabled}
          />
          Pro/Am split enabled
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team scoring mode
          </span>
          <select
            name="teamScoringMode"
            defaultValue={season.teamScoringMode}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="NONE">None</option>
            <option value="SUM_ALL">Sum all drivers</option>
            <option value="SUM_BEST_N">Sum best N drivers per race</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Best-N value
          </span>
          <input
            name="teamScoringBestN"
            type="number"
            defaultValue={season.teamScoringBestN ?? 2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
