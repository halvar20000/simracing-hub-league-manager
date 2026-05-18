import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { createScoringSystem } from "@/lib/actions/scoring-systems";

export default async function NewScoringSystemPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireAdmin();
  const { error } = await searchParams;

  const existing = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { seasons: true } } },
  });

  return (
    <div className="space-y-6 max-w-xl">
      <div>
        <Link
          href="/admin/scoring-systems"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Scoring systems
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New scoring system</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Create a fresh empty system, or copy every field (points
          table, bonuses, participation rule, FPR config, etc.) from an
          existing one as a starting point. After creating you&apos;ll
          land on the edit page where you can refine it.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={createScoringSystem} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Name <span className="text-orange-400">*</span>
          </span>
          <input
            name="name"
            required
            placeholder="e.g. CAS GT3 WCT 2027"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Must be unique. Used to identify the system on the season
            edit page.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Copy from (optional)
          </span>
          <select
            name="copyFromId"
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="">— Create blank —</option>
            {existing.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s._count.seasons > 0
                  ? ` · used in ${s._count.seasons} season${s._count.seasons === 1 ? "" : "s"}`
                  : ""}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-zinc-500">
            All fields are duplicated (points table, bonuses, FPR,
            participation rule, protest window, etc.). Only the name is
            different. Picking nothing creates a blank system.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create scoring system
          </button>
          <Link
            href="/admin/scoring-systems"
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
