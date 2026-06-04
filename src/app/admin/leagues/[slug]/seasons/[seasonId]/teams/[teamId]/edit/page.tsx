import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTeam, deleteTeam } from "@/lib/actions/teams";
import {
  assignTeamManager,
  removeTeamManager,
} from "@/lib/actions/registrations";

export default async function EditTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string; teamId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId, teamId } = await params;
  const { error, success } = await searchParams;

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

  const managerUser = team.managerUserId
    ? await prisma.user.findUnique({
        where: { id: team.managerUserId },
        select: { firstName: true, lastName: true, email: true },
      })
    : null;

  const update = updateTeam.bind(null, slug, seasonId, teamId);
  const remove = deleteTeam.bind(null, slug, seasonId, teamId);
  const editPath = `/admin/leagues/${slug}/seasons/${seasonId}/teams/${teamId}/edit`;

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

      {error && (
        <div className="max-w-xl rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="max-w-xl rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

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

      {/* === Team manager (not driving) === */}
      <section className="max-w-xl border-t border-zinc-800 pt-6">
        <h2 className="mb-2 text-sm font-semibold text-zinc-300">
          Team manager (not driving)
        </h2>
        {managerUser ? (
          <div className="flex flex-wrap items-center gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-3">
            <p className="text-sm">
              <span className="text-cyan-300">◆</span>{" "}
              <strong>
                {managerUser.firstName} {managerUser.lastName}
              </strong>{" "}
              <span className="text-zinc-500">{managerUser.email ?? ""}</span>
            </p>
            <form action={removeTeamManager}>
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="redirectTo" value={editPath} />
              <button
                type="submit"
                className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/50"
              >
                Remove manager
              </button>
            </form>
          </div>
        ) : (
          <form
            action={assignTeamManager}
            className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-3"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="redirectTo" value={editPath} />
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">
                Manager&apos;s email or full name (existing CLS account)
              </span>
              <input
                name="managerQuery"
                required
                placeholder="manager@example.com or John Doe"
                className="w-72 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              />
            </label>
            <button
              type="submit"
              className="rounded border border-cyan-700/50 bg-cyan-950/30 px-3 py-1.5 text-sm text-cyan-200 hover:bg-cyan-900/50"
            >
              Assign manager
            </button>
          </form>
        )}
      </section>

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
