import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRegistration, createTeamRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";
import TeamIRatingValidator from "@/components/TeamIRatingValidator";
import TeamClassCarSelect from "@/components/TeamClassCarSelect";

import type { Metadata } from "next";
import { pageMetadataLarge } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug)
    return pageMetadataLarge({
      title: "Registration not available",
      description:
        "This season is not currently open for registration, or the link is invalid.",
    });

  const isTeam = season.teamRegistration;
  const title = isTeam
    ? `Register your team — ${season.league.name} ${season.name} ${season.year}`
    : `Register — ${season.league.name} ${season.name} ${season.year}`;
  const description = isTeam
    ? `Click to register your team. Add up to 4 teammates, pick your class and car. Limited slots — first come first served.`
    : `Click to register for this season. Pick your car, set your start number, and you're in.`;

  return pageMetadataLarge({
    title,
    description,
    url: `/leagues/${slug}/seasons/${seasonId}/register`,
  });
}


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
    return (
      <div className="max-w-xl space-y-4">
        <h1 className="text-2xl font-bold">Sign in to register</h1>
        <p className="text-zinc-400">
          You must be signed in with Discord to register for this season.
        </p>
        <Link
          href={`/api/auth/signin?callbackUrl=${encodeURIComponent(cbPath)}`}
          className="inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-indigo-500"
        >
          Sign in with Discord
        </Link>
      </div>
    );
  }

  const [season, user, teams, carClasses, existing] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: {
        league: true,
        rounds: {
          where: {
            countsForChampionship: true,
            startsAt: { lte: new Date() },
          },
          take: 1,
          select: { id: true },
        },
      },
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
      include: { team: true },
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
  const paymentInfo = getLeaguePayment(season.league);
  const seasonHasStarted = season.rounds.length > 0;
  const carLocked =
    !!existing?.carId &&
    (season.status === "ACTIVE" || seasonHasStarted);
  const lockedCarId = carLocked ? existing?.carId ?? null : null;
  const lockedCar = lockedCarId
    ? carClasses.flatMap((cc) => cc.cars).find((c) => c.id === lockedCarId) ?? null
    : null;
  if (season.teamRegistration) {
    const createTeam = createTeamRegistration.bind(
      null,
      slug,
      seasonId,
      t ?? ""
    );

    // Pre-fill teammate rows from existing team if user is the leader.
    const leaderTeamId = existing?.teamId ?? null;
    const teammateRegs = leaderTeamId
      ? await prisma.registration.findMany({
          where: {
            teamId: leaderTeamId,
            userId: { not: session.user.id },
          },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const tmRow = (i: number) => teammateRegs[i] ?? null;

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.league.name} {season.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {existing
              ? "Update your team registration"
              : "Register your team"}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Multiclass team season. Add up to 4 teammates — they&apos;ll show
            on the roster automatically. Each driver gets their own iRacing
            invitation tracked.
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="text-zinc-400">Team leader (you):</p>
          <p className="mt-1 font-semibold text-zinc-200">
            {user.firstName} {user.lastName}{" "}
            <span className="text-zinc-500">
              (iRacing #{user.iracingMemberId})
            </span>
          </p>
        </div>

        <form action={createTeam} className="space-y-4">
          <fieldset className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="px-2 text-sm text-zinc-300">Team</legend>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Team name <span className="text-orange-400">*</span>
              </span>
              <input
                name="teamName"
                required
                defaultValue={existing?.team?.name ?? ""}
                placeholder="e.g. CAS Racing #1"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Your current iRating <span className="text-orange-400">*</span>
              </span>
              <input
                name="leaderIRating"
                type="number"
                min={0}
                max={20000}
                required
                defaultValue={existing?.iRating ?? ""}
                placeholder="e.g. 2400"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Maximum 5000 for all classes. Minimum 1500 for LMP2.
              </span>
            </label>
          </fieldset>

          <TeamClassCarSelect
            carClasses={carClasses.map((c) => ({
              id: c.id,
              name: c.name,
              shortCode: c.shortCode,
              isLocked: c.isLocked,
              cars: c.cars.map((car) => ({ id: car.id, name: car.name })),
            }))}
            defaultClassId={existing?.carClassId ?? undefined}
            defaultCarId={existing?.carId ?? undefined}
          />

          <fieldset className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="px-2 text-sm text-zinc-300">
              Register teammates (up to 4)
            </legend>
            <p className="text-xs text-zinc-500">
              Provide each teammate&apos;s iRacing display name and ID. Email
              is optional but helps if they later want to log in to manage
              their own profile. Empty rows are ignored.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 font-normal">iRacing name</th>
                    <th className="pb-2 pr-2 font-normal">iRacing ID</th>
                    <th className="pb-2 pr-2 font-normal">iRating</th>
                    <th className="pb-2 font-normal">Email (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((i) => {
                    const pre = tmRow(i - 1);
                    const preName = pre
                      ? `${pre.user.firstName ?? ""} ${pre.user.lastName ?? ""}`.trim()
                      : "";
                    const preIr = pre?.user.iracingMemberId ?? "";
                    const preEmail = pre?.user.email ?? "";
                    return (
                      <tr key={i}>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}Name`}
                            defaultValue={preName}
                            placeholder="John Doe"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}IracingId`}
                            defaultValue={preIr}
                            inputMode="numeric"
                            placeholder="123456"
                            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}IRating`}
                            type="number"
                            min={0}
                            max={20000}
                            inputMode="numeric"
                            defaultValue={pre?.iRating ?? ""}
                            placeholder="2400"
                            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            name={`teammate${i}Email`}
                            type="email"
                            defaultValue={preEmail}
                            placeholder="optional@example.com"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>

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
          <TeamIRatingValidator
            classes={carClasses.map((c) => ({ id: c.id, shortCode: c.shortCode }))}
          />

          {paymentInfo && (
            <PaymentNotice payment={paymentInfo} variant="preview" />
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              {existing ? "Update team registration" : "Submit team registration"}
            </button>
          </div>
        </form>
      </div>
    );
  }



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

        {paymentInfo && (
          <PaymentNotice payment={paymentInfo} variant="preview" />
        )}

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
