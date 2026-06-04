import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRegistration, createTeamRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";
import TeamIRatingValidator from "@/components/TeamIRatingValidator";
import SoloIRatingValidator from "@/components/SoloIRatingValidator";
import TeamClassCarSelect from "@/components/TeamClassCarSelect";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import TeamPicker from "@/components/TeamPicker";
import TeamManagerToggle from "@/components/TeamManagerToggle";
import { teamSizeLimit, GT3_WCT_TEAM_LIMIT } from "@/lib/team-limit";
import { getSflIRatingGate } from "@/lib/sfl-irating-gate";
import {
  getLeagueIratingCategory,
  iratingCategoryShortLabel,
  getUserLiveIratingForLeague,
} from "@/lib/league-irating-category";

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

  const [
    season,
    user,
    teams,
    carClassesRaw,
    sharedCars,
    existing,
    teamCountGroups,
  ] = await Promise.all([
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
      // Season-wide shared cars (carClassId NULL). On PRO/AM leagues these
      // are the actual car list and should appear under every class.
      prisma.car.findMany({
        where: { seasonId, carClassId: null },
        orderBy: { displayOrder: "asc" },
        select: {
          id: true,
          name: true,
          shortName: true,
          iracingCarId: true,
          displayOrder: true,
        },
      }),
      prisma.registration.findUnique({
        where: { seasonId_userId: { seasonId, userId: session.user.id } },
        include: { team: true },
      }),
      // Per-team driver counts (PENDING + APPROVED, not excluded) — used by
      // the GT3 WCT team picker to mark teams that are already full.
      prisma.registration.groupBy({
        by: ["teamId"],
        where: {
          seasonId,
          teamId: { not: null },
          status: { in: ["PENDING", "APPROVED"] },
          excludedAt: null,
        },
        _count: true,
      }),
    ]);

  // Merge shared cars into every CarClass's cars list — admins now configure
  // cars season-wide once and they apply to every driver class. Reduce each
  // car to {id, name} since that's all the dropdown rendering needs.
  const carClasses = carClassesRaw.map((cc) => {
    const ownCars = cc.cars.map((c) => ({ id: c.id, name: c.name }));
    const extras = sharedCars
      .filter((sc) => !ownCars.some((c) => c.id === sc.id))
      .map((sc) => ({ id: sc.id, name: sc.name }));
    return {
      ...cc,
      cars: [...ownCars, ...extras],
    };
  });

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
  const activeRegistration = isUpdate ? existing : null;

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
  // Single-car convenience: when the season has exactly one car (e.g. SFL has
  // only "Super Formula Lights") and the driver doesn't already have a car
  // assigned, pre-select that single car in the dropdown so the field isn't
  // visually empty. The select stays `required`, but the user just sees the
  // right value already chosen.
  const allCars = carClasses.flatMap((cc) => cc.cars);
  const uniqueCarIds = new Set(allCars.map((c) => c.id));
  const soloDefaultCarId =
    uniqueCarIds.size === 1 ? [...uniqueCarIds][0] : null;
  const carSelectDefault = existing?.carId ?? soloDefaultCarId ?? "";
  if (season.teamRegistration) {
    const createTeam = createTeamRegistration.bind(
      null,
      slug,
      seasonId,
      t ?? ""
    );

    // Per-team driver cap from the season (e.g. IEC: 3 = leader + 2). When
    // unset (uncapped), keep the historical 4-teammate row maximum.
    const teamLimit = teamSizeLimit({
      leagueSlug: season.league.slug,
      teamMaxDrivers: season.teamMaxDrivers,
    });
    const maxTeammates = teamLimit != null ? Math.max(0, teamLimit - 1) : 4;
    // A non-driving Teammanager frees one extra driver slot — render the
    // extra row(s) but keep them hidden unless manager mode is active.
    const maxManagerRows = teamLimit != null ? teamLimit : 5;
    const teammateRowIndices = Array.from(
      { length: maxManagerRows },
      (_, i) => i + 1
    );
    const isManagerReg = activeRegistration?.isTeamManager ?? false;
    // Teams this user already manages in this season — a manager can register
    // several teams (each submit with a NEW team name creates another team).
    const myManagedTeams = await prisma.team.findMany({
      where: { seasonId, managerUserId: session.user.id },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });

    // Pre-fill teammate rows from existing team if user is the leader.
    const leaderTeamId = activeRegistration?.teamId ?? null;
    const teammateRegs = leaderTeamId
      ? await prisma.registration.findMany({
          where: {
            teamId: leaderTeamId,
            userId: { not: session.user.id },
            status: { notIn: ["WITHDRAWN", "REJECTED"] },
            isTeamManager: false,
          },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const tmRow = (i: number) => teammateRegs[i] ?? null;
    // Teamchef preselect: the row whose user is the current team leader.
    const chefDefaultIndex =
      (activeRegistration?.team?.leaderUserId
        ? teammateRegs.findIndex(
            (r) => r.userId === activeRegistration.team!.leaderUserId
          )
        : -1) + 1; // 0 = none → first row checked below via `|| i === 1`

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
            {activeRegistration
              ? "Update your team registration"
              : "Register your team"}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Multiclass team season. Add up to {maxTeammates} teammates —
            they&apos;ll show on the roster automatically. Each driver gets
            their own iRacing invitation tracked.
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="text-zinc-400">Registering (you):</p>
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
            <TeamManagerToggle defaultChecked={isManagerReg} />
            {myManagedTeams.length > 0 && (
              <p className="rounded border border-zinc-700 bg-zinc-900 p-2 text-xs text-zinc-400">
                You already manage{" "}
                <strong className="text-zinc-200">
                  {myManagedTeams.map((t) => t.name).join(", ")}
                </strong>
                . Enter a <strong>new team name</strong> below to register an
                additional team — existing teams are edited via{" "}
                <Link
                  href="/registrations"
                  className="text-orange-400 underline hover:text-orange-300"
                >
                  Manage Team
                </Link>
                .
              </p>
            )}
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Team name <span className="text-orange-400">*</span>
              </span>
              <input
                name="teamName"
                required
                defaultValue={activeRegistration?.team?.name ?? ""}
                placeholder="e.g. CAS Racing #1"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label
              className="block"
              data-driver-only
              style={isManagerReg ? { display: "none" } : undefined}
            >
              <span className="mb-1 block text-sm text-zinc-300">
                Your current iRating <span className="text-orange-400">*</span>
              </span>
              <input
                name="leaderIRating"
                type="number"
                min={0}
                max={20000}
                required={!isManagerReg}
                disabled={isManagerReg}
                data-was-required="1"
                defaultValue={activeRegistration?.iRating ?? ""}
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
            defaultClassId={activeRegistration?.carClassId ?? undefined}
            defaultCarId={activeRegistration?.carId ?? undefined}
          />

          <fieldset className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="px-2 text-sm text-zinc-300">
              Register teammates (up to {maxTeammates})
            </legend>
            <div className="rounded border border-orange-700/60 bg-orange-950/30 p-3 text-sm space-y-2">
              <p className="font-bold text-white">
                Every driver of a team must be registered with his real name on
                our CAS Discord Channel. This is mandatory to get the Team
                approved for the Season.
              </p>
              <p className="font-bold text-white">
                Jeder Fahrer eines Teams muss mit seinem echten Namen auf
                unserem CAS Discord Channel registriert sein. Dies ist
                Voraussetzung dafür, dass das Team für die Saison zugelassen
                wird.
              </p>
              <p className="text-xs text-zinc-300">
                Discord invite (copy &amp; forward to your teammates):{" "}
                <a
                  href="https://discord.gg/DFzazSxj"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono font-semibold text-orange-300 underline hover:text-orange-200"
                >
                  https://discord.gg/DFzazSxj
                </a>
              </p>
            </div>
            <p className="text-xs text-zinc-500">
              Provide each teammate&apos;s iRacing display name and ID. Email
              is optional but helps if they later want to log in to manage
              their own profile. Empty rows are ignored.
              {teamLimit != null && (
                <>
                  {" "}This season caps teams at <strong>{teamLimit} drivers</strong> total
                  (team leader + {maxTeammates} teammates). As Teammanager you
                  don&apos;t count against the cap — you register up to{" "}
                  {maxManagerRows} drivers and mark one of them as Teamchef.
                </>
              )}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 font-normal">iRacing name</th>
                    <th className="pb-2 pr-2 font-normal">iRacing ID</th>
                    <th className="pb-2 pr-2 font-normal">iRating</th>
                    <th className="pb-2 font-normal">Email (optional)</th>
                    <th
                      className="pb-2 pl-2 font-normal"
                      data-chef-cell
                      style={isManagerReg ? undefined : { display: "none" }}
                    >
                      Teamchef
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {teammateRowIndices.map((i) => {
                    const pre = tmRow(i - 1);
                    const preName = pre
                      ? `${pre.user.firstName ?? ""} ${pre.user.lastName ?? ""}`.trim()
                      : "";
                    const preIr = pre?.user.iracingMemberId ?? "";
                    const preEmail = pre?.user.email ?? "";
                    // Rows beyond the normal teammate allowance only exist in
                    // manager mode (manager doesn't occupy a driver slot).
                    const managerOnlyRow = i > maxTeammates;
                    return (
                      <tr
                        key={i}
                        {...(managerOnlyRow
                          ? { "data-manager-only-row": "" }
                          : {})}
                        style={
                          managerOnlyRow && !isManagerReg
                            ? { display: "none" }
                            : undefined
                        }
                      >
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}Name`}
                            defaultValue={preName}
                            disabled={managerOnlyRow && !isManagerReg}
                            placeholder="John Doe"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}IracingId`}
                            defaultValue={preIr}
                            inputMode="numeric"
                            disabled={managerOnlyRow && !isManagerReg}
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
                            disabled={managerOnlyRow && !isManagerReg}
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
                            disabled={managerOnlyRow && !isManagerReg}
                            placeholder="optional@example.com"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td
                          className="py-1 pl-2 text-center"
                          data-chef-cell
                          style={isManagerReg ? undefined : { display: "none" }}
                        >
                          <input
                            type="radio"
                            name="teamchefIndex"
                            value={i}
                            disabled={!isManagerReg}
                            defaultChecked={
                              chefDefaultIndex === i ||
                              (chefDefaultIndex === 0 && i === 1)
                            }
                            title="This driver is the Teamchef"
                            className="h-4 w-4 accent-orange-500"
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
              defaultValue={activeRegistration?.notes ?? ""}
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
            <SubmitWithSpinner
              label={activeRegistration ? "Update team registration" : "Submit team registration"}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            />
          </div>
        </form>
      </div>
    );
  }

  // GT3 WCT: the driver does not choose a class — an admin allocates the
  // Pro/Am tier after registration. Hide the class dropdown and present the
  // car picker as a single flat list (deduped: shared cars are merged into
  // every class above, so flattening carClasses would repeat them).
  const isGt3Wct = season.league.slug === "cas-gt3-wct";
  const gt3WctCars = (() => {
    const seen = new Set<string>();
    const flat: { id: string; name: string }[] = [];
    for (const cc of carClasses) {
      for (const c of cc.cars) {
        if (!seen.has(c.id)) {
          seen.add(c.id);
          flat.push(c);
        }
      }
    }
    return flat;
  })();

  // Per-team driver counts for the GT3 WCT team picker.
  const countByTeamId = new Map(
    teamCountGroups.map((g) => [g.teamId, g._count] as const)
  );
  const teamsWithCounts = teams.map((tm) => ({
    id: tm.id,
    name: tm.name,
    memberCount: countByTeamId.get(tm.id) ?? 0,
  }));

  // SFL Cup: iRating cap for new drivers — drivers who raced in the most
  // recent prior SFL Cup season are exempt. getSflIRatingGate returns
  // applies=false for every other league, so this is a no-op elsewhere.
  const sflGate = await getSflIRatingGate(season, user.id);

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

        {sflGate.applies && (() => {
          // SFL Cup is a formula league — drivers must enter their
          // Formula Car iRating, not the Sports Car number most people
          // quote by default. Pre-fill with the live synced value when
          // we have it so they don't have to guess.
          const categoryLabel = iratingCategoryShortLabel(
            getLeagueIratingCategory(season.league.slug)
          );
          const liveIrating = user
            ? getUserLiveIratingForLeague(user, season.league.slug)
            : null;
          return (
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Your current {categoryLabel} iRating{" "}
                <span className="text-orange-400">*</span>
              </span>
              <input
                name="iRating"
                type="number"
                min={1}
                max={20000}
                required
                inputMode="numeric"
                defaultValue={existing?.iRating ?? liveIrating ?? ""}
                placeholder="e.g. 2400"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              {liveIrating != null && existing?.iRating == null && (
                <span className="mt-1 block text-xs text-zinc-500">
                  Pre-filled from your live iRacing {categoryLabel} iRating
                  ({liveIrating}). Edit if out of date.
                </span>
              )}
              {sflGate.exempt ? (
                <span className="mt-1 block text-xs text-emerald-400">
                  ✓ You raced in the previous SFL Cup season — the{" "}
                  {sflGate.maxIRating} {categoryLabel} iRating cap does
                  not apply to you.
                </span>
              ) : (
                <span className="mt-1 block text-xs text-zinc-500">
                  New drivers must be at or below {sflGate.maxIRating}{" "}
                  {categoryLabel} iRating. Drivers who raced in the
                  previous SFL Cup season may register at any iRating.
                </span>
              )}
            </label>
          );
        })()}

        {isGt3Wct ? (
          <TeamPicker
            teams={teamsWithCounts}
            limit={
              teamSizeLimit({
                leagueSlug: season.league.slug,
                teamMaxDrivers: season.teamMaxDrivers,
              }) ?? GT3_WCT_TEAM_LIMIT
            }
            currentTeamId={existing?.teamId ?? null}
          />
        ) : (
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
        )}

        {season.isMulticlass &&
          !isGt3Wct &&
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
                defaultValue={carSelectDefault}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select car…</option>
                {isGt3Wct
                  ? gt3WctCars.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))
                  : season.isMulticlass
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
            defaultValue={activeRegistration?.notes ?? ""}
            placeholder="Anything you want the admin to know"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        {sflGate.applies && (
          <SoloIRatingValidator
            maxIRating={sflGate.maxIRating}
            exempt={sflGate.exempt}
          />
        )}

        {paymentInfo && (
          <PaymentNotice payment={paymentInfo} variant="preview" />
        )}

        <div className="flex gap-2">
          <SubmitWithSpinner
            label={isUpdate ? "Update registration" : "Submit registration"}
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          />
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
