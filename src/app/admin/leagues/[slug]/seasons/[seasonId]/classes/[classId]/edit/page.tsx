import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCarClass, deleteCarClass } from "@/lib/actions/car-classes";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; classId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, classId } = await params;

  const carClass = await prisma.carClass.findUnique({
    where: { id: classId },
    include: { season: { include: { league: true } } },
  });
  if (
    !carClass ||
    carClass.seasonId !== seasonId ||
    carClass.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateCarClass.bind(null, slug, seasonId, classId);
  const remove = deleteCarClass.bind(null, slug, seasonId, classId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Car Class</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Display name</span>
          <input
            name="name"
            required
            defaultValue={carClass.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Short code</span>
          <input
            name="shortCode"
            required
            defaultValue={carClass.shortCode}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Display order</span>
          <input
            name="displayOrder"
            type="number"
            defaultValue={carClass.displayOrder}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>

      <form action={remove} className="border-t border-zinc-800 pt-6">
        <p className="mb-2 text-sm text-zinc-500">
          Deleting a class detaches it from any drivers in that class. Their
          registrations remain but with no class assigned.
        </p>
        <button
          type="submit"
          className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
        >
          Delete this class
        </button>
      </form>
    </div>
  );
}
