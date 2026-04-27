import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createCarClass } from "@/lib/actions/car-classes";

export default async function NewClassPage({
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
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const create = createCarClass.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Car Class</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Display name <span className="text-orange-400">*</span>
          </span>
          <input
            name="name"
            required
            placeholder="GT3"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Short code <span className="text-orange-400">*</span>
          </span>
          <input
            name="shortCode"
            required
            placeholder="GT3"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Used for display. Must be unique per season.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Display order
          </span>
          <input
            name="displayOrder"
            type="number"
            defaultValue={0}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Lower numbers appear first. Use 0, 10, 20… so you can insert later.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create Class
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
