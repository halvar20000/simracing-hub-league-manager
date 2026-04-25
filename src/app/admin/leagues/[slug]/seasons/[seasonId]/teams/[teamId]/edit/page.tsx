import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTeam, deleteTeam } from "@/lib/actions/teams";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; teamId: string }>;
}) {
  const { slug, seasonId, teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { season: { include: { league: true } } },
  });
  if (
    !team ||
    team.seasonId !== seasonId ||
    team.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateTeam.bind(null, slug, seasonId, teamId);
  const remove = deleteTeam.bind(null, slug, seasonId, teamId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to teams
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Team</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Team name</span>
          <input
            name="name"
            required
            defaultValue={team.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Short name</span>
          <input
            name="shortName"
            defaultValue={team.shortName ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Logo URL</span>
          <input
            name="logoUrl"
            defaultValue={team.logoUrl ?? ""}
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>

      <form action={remove} className="border-t border-zinc-800 pt-6">
        <p className="mb-2 text-sm text-zinc-500">
          Deleting a team detaches it from any drivers currently assigned to
          it. Their registrations stay intact, just without a team.
        </p>
        <button
          type="submit"
          className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
        >
          Delete this team
        </button>
      </form>
    </div>
  );
}
