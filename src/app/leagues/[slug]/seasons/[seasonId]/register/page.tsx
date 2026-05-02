import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRegistration } from "@/lib/actions/registrations";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ error?: string; t?: string }>;
}) {
  const { slug, seasonId } = await params;
  const { error, t } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    const cbPath = `/leagues/${slug}/seasons/${seasonId}/register${t ? `?t=${encodeURIComponent(t)}` : ""}`;
    redirect(`/api/auth/signin?callbackUrl=${encodeURIComponent(cbPath)}`);
  }

  const [season, user, teams, carClasses, existing] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: { league: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.team.findMany({
      where: { seasonId },
      orderBy: { name: "asc" },
    }),
    prisma.carClass.findMany({
      where: { seasonId },
      orderBy: { displayOrder: "asc" },
      include: {
        cars: { orderBy: { displayOrder: "asc" } },
      },
    }),
    prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId, userId: session.user.id } },
    }),
  ]);

  if (!season || season.league.slug !== slug) notFound();

  if (season.registrationToken && season.registrationToken !== t) {
    return (
      <div className="max-w-xl space-y-4">
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">Registration is link-protected</h1>
        <p className="text-zinc-400">
          This season requires a personal invitation link to register. Please
          ask the league administrator for the registration link.
        </p>
      </div>
    );
  }
  if (!user) redirect("/api/auth/signin");

  if (!user.firstName || !user.lastName || !user.iracingMemberId) {
    redirect(
      `/profile?error=Please+complete+your+profile+before+registering`
    );
  }

  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    return (
      <div className="space-y-4">
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">Registration is not open</h1>
        <p className="text-zinc-400">
          {season.name} {season.year} is currently in status{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">
            {season.status.replace("_", " ")}
          </code>
          .
        </p>
      </div>
    );
  }

  const create = createRegistration.bind(null, slug, seasonId, t ?? "");
  const isUpdate =
    existing &&
    existing.status !== "WITHDRAWN" &&
    existing.status !== "REJECTED";

  const hasCars = carClasses.some((cc) => cc.cars.length > 0);
  const carLocked = !!existing?.carId && season.status === "ACTIVE";
  const lockedCarId = carLocked ? existing?.carId ?? null : null;
  const lockedCar = lockedCarId
    ? carClasses.flatMap((cc) => cc.cars).find((c) => c.id === lockedCarId) ?? null
    : null;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {isUpdate ? "Update your registration" : "Register for this season"}
        </h1>
      </div>

      {isUpdate && (
        <div className="rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
          You already have a {existing.status.toLowerCase()} registration.
          Submitting will reset it to PENDING for re-approval.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <p className="text-zinc-400">Registering as:</p>
        <p className="mt-1 font-semibold text-zinc-200">
          {user.firstName} {user.lastName}{" "}
          <span className="text-zinc-500">
            (iRacing #{user.iracingMemberId})
          </span>
        </p>
        <Link
          href="/profile"
          className="mt-2 inline-block text-xs text-orange-400 hover:underline"
        >
          Edit profile
        </Link>
      </div>

      <form action={create} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Preferred start number
          </span>
          <input
            name="startNumber"
            type="number"
            min={1}
            max={999}
            defaultValue={existing?.startNumber ?? ""}
            placeholder="e.g. 42"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Subject to availability — admin may assign a different number.
          </span>
        </label>

        <fieldset className="space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <legend className="px-2 text-sm text-zinc-300">Team</legend>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">
              Pick an existing team
            </span>
            <select
              name="teamId"
              defaultValue={existing?.teamId ?? ""}
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

          <div className="text-center text-xs text-zinc-500">— or —</div>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">
              Create a new team
            </span>
            <input
              name="newTeamName"
              placeholder="Type a new team name to create it"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              If filled, this creates a new team for the season and overrides
              the dropdown above. Leave empty if you picked from the dropdown
              or are racing independently.
            </span>
          </label>
        </fieldset>

        {season.isMulticlass &&
          (carClasses.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Class <span className="text-orange-400">*</span>
              </span>
              <select
                name="carClassId"
                required
                defaultValue={existing?.carClassId ?? ""}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select class…</option>
                {carClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded border border-amber-800 bg-amber-950 p-3 text-xs text-amber-200">
              This is a multiclass season but no classes have been defined yet.
              Ask the admin to add car classes before registering.
            </div>
          ))}
        {hasCars && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Car <span className="text-orange-400">*</span>
            </span>
            {carLocked ? (
              <div className="space-y-1">
                <input
                  type="hidden"
                  name="carId"
                  value={existing?.carId ?? ""}
                />
                <div className="rounded border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-300">
                  {lockedCar?.name ?? "—"}
                </div>
                <span className="block text-xs text-amber-300">
                  Locked — your car cannot be changed once the season is
                  active.
                </span>
              </div>
            ) : (
              <select
                name="carId"
                required
                defaultValue={existing?.carId ?? ""}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select car…</option>
                {season.isMulticlass
                  ? carClasses
                      .filter((cc) => cc.cars.length > 0)
                      .map((cc) => (
                        <optgroup key={cc.id} label={cc.name}>
                          {cc.cars.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name}
                            </option>
                          ))}
                        </optgroup>
                      ))
                  : carClasses
                      .flatMap((cc) => cc.cars)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
              </select>
            )}
          </label>
        )}



        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Notes (optional)
          </span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={existing?.notes ?? ""}
            placeholder="Anything you want the admin to know"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            {isUpdate ? "Update registration" : "Submit registration"}
          </button>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
