import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateRegistration } from "@/lib/actions/admin-registrations";

export default async function EditRegistrationPage({
  params,
}: {
  params: Promise<{
    slug: string;
    seasonId: string;
    registrationId: string;
  }>;
}) {
  const { slug, seasonId, registrationId } = await params;

  const [registration, teams, classes] = await Promise.all([
    prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        user: true,
        season: { include: { league: true } },
      },
    }),
    prisma.team.findMany({
      where: { seasonId },
      orderBy: { name: "asc" },
    }),
    prisma.carClass.findMany({
      where: { seasonId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  if (
    !registration ||
    registration.seasonId !== seasonId ||
    registration.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateRegistration.bind(
    null,
    slug,
    seasonId,
    registrationId
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to roster
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Edit Registration —{" "}
          <span className="text-zinc-400">
            {registration.user.firstName} {registration.user.lastName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          iRacing #{registration.user.iracingMemberId} •{" "}
          {registration.user.email ?? registration.user.name}
        </p>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={registration.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Start number</span>
          <input
            name="startNumber"
            type="number"
            min={1}
            max={999}
            defaultValue={registration.startNumber ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Team</span>
          <select
            name="teamId"
            defaultValue={registration.teamId ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">No team / Independent</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {registration.season.isMulticlass && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Class</span>
            <select
              name="carClassId"
              defaultValue={registration.carClassId ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Not set —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {registration.season.proAmEnabled && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Pro/Am</span>
            <select
              name="proAmClass"
              defaultValue={registration.proAmClass ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Not set —</option>
              <option value="PRO">Pro</option>
              <option value="AM">Am</option>
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              Set after a test race or based on previous league results.
            </span>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Notes</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={registration.notes ?? ""}
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
