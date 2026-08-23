import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  updateTeamRegistration,
  withdrawTeam,
  transferTeamLeadership,
  assignTeamManager,
  removeTeamManager,
  updateTeamClassCar,
  renameTeam,
} from "@/lib/actions/registrations";
import TeamIRatingValidator from "@/components/TeamIRatingValidator";
import UserSearchPicker from "@/components/UserSearchPicker";
import TeamClassCarSelect from "@/components/TeamClassCarSelect";
import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";
import {
  resolveTeamOwnership,
  isActiveTeamMember,
} from "@/lib/team-ownership";

export default async function ManageTeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ error?: string; success?: string; embed?: string }>;
}) {
  const { teamId } = await params;
  const { error, success, embed: embedParam } = await searchParams;
  // Embedded mode: rendered inside an iframe (the in-page "Manage team" modal
  // on the roster / registrations pages). Strip the site chrome and keep all
  // post-action redirects pointing back at this embed URL so the iframe never
  // shows the full nav/footer.
  const embed = embedParam === "1";
  const basePath = embed
    ? `/teams/${teamId}/manage?embed=1`
    : `/teams/${teamId}/manage`;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(basePath)}`
    );
  }

  // Hides the global nav/footer/contact-FAB and tightens the main padding when
  // rendered inside the roster modal's iframe.
  const embedStyle = embed ? (
    <style
      dangerouslySetInnerHTML={{
        __html:
          'nav,footer{display:none!important}main{max-width:none!important;padding:1rem!important}[aria-label="Report an issue / Contact developer"]{display:none!important}',
      }}
    />
  ) : null;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      season: {
        include: {
          league: true,
          carClasses: { include: { cars: true } },
        },
      },
      registrations: {
        include: { user: true, carClass: true, car: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!team) notFound();

  // A leader/manager id whose User was deleted or merged away leaves the team
  // ownerless — any active roster member may then manage it (the action heals
  // Team.leaderUserId on the first write). See @/lib/team-ownership.
  const owner = await resolveTeamOwnership(team);
  const adopts =
    owner.ownerless && (await isActiveTeamMember(team.id, session.user.id));
  const isLeader = owner.leaderUserId === session.user.id || adopts;
  const isManager = owner.managerUserId === session.user.id;
  const viewer = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true },
  });
  const isAdmin = viewer?.role === "ADMIN";
  const leaderReg = team.registrations.find(
    (r) => r.userId === team.leaderUserId
  );
  const managerUser = team.managerUserId
    ? await prisma.user.findUnique({
        where: { id: team.managerUserId },
        select: { firstName: true, lastName: true },
      })
    : null;

  // Class & car are changeable until the season's first race has started.
  const startedRound = await prisma.round.findFirst({
    where: { seasonId: team.seasonId, startsAt: { lte: new Date() } },
    select: { id: true },
  });
  const classCarLocked = !!startedRound;

  // Season-wide shared cars (carClassId NULL) apply to every class — same
  // merge as on the registration form.
  const sharedCars = await prisma.car.findMany({
    where: { seasonId: team.seasonId, carClassId: null },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true },
  });
  const carClassesForSelect = team.season.carClasses.map((cc) => {
    const ownCars = cc.cars.map((c) => ({ id: c.id, name: c.name }));
    const extras = sharedCars.filter(
      (sc) => !ownCars.some((c) => c.id === sc.id)
    );
    return {
      id: cc.id,
      name: cc.name,
      shortCode: cc.shortCode,
      isLocked: cc.isLocked,
      cars: [...ownCars, ...extras],
    };
  });
  // Driver rows only — the manager's own registration is never edited here.
  const teammates = team.registrations.filter(
    (r) =>
      r.userId !== team.leaderUserId &&
      r.status !== "WITHDRAWN" &&
      !r.isTeamManager
  );

  if (!isLeader && !isManager && !isAdmin) {
    return (
      <div className="space-y-4">
        {embedStyle}
        {!embed && (
          <Link
            href="/registrations"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← My registrations
          </Link>
        )}
        <h1 className="text-2xl font-bold">Team management</h1>
        <p className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          Only the current team leader or team manager can manage this team.
          The leader is{" "}
          <strong>
            {leaderReg?.user.firstName} {leaderReg?.user.lastName}
          </strong>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      {embedStyle}
      <div>
        {!embed && (
          <Link
            href="/registrations"
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← My registrations
          </Link>
        )}
        <h1 className={`${embed ? "" : "mt-2 "}text-2xl font-bold`}>Manage team</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {team.name} · {team.season.league.name} {team.season.name}{" "}
          {team.season.year} · {leaderReg?.carClass?.name} ·{" "}
          {leaderReg?.car?.name}
        </p>
        {isManager && (
          <p className="mt-1 text-xs text-cyan-300">
            You manage this team as Teammanager (not driving). Teamchef:{" "}
            {leaderReg
              ? `${leaderReg.user.firstName ?? ""} ${leaderReg.user.lastName ?? ""}`.trim()
              : "—"}
          </p>
        )}
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          {success}
        </div>
      )}

      {/* === Team name (until the first race has started) === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Team name
        </h2>
        {classCarLocked && !isAdmin ? (
          <p className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
            The season has started — the team name is locked. Current:{" "}
            <strong className="text-zinc-200">{team.name}</strong>. Contact an
            admin if a change is still needed.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-500">
              Fix a typo or adjust the team name. Possible until the first
              race of the season has started. The name must be unique within
              the season.
              {classCarLocked && isAdmin && (
                <span className="text-amber-300">
                  {" "}Season has started — visible to you as admin only.
                </span>
              )}
            </p>
            <form
              action={renameTeam}
              className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="redirectTo" value={basePath} />
              <label className="block grow">
                <span className="mb-1 block text-xs text-zinc-400">
                  Team name
                </span>
                <input
                  name="newName"
                  required
                  maxLength={60}
                  defaultValue={team.name}
                  className="w-full max-w-md rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
                />
              </label>
              <SubmitWithSpinner
                label="Rename team"
                className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              />
            </form>
          </>
        )}
      </section>

      {/* === Update form === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Edit team
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Drivers can be changed at any time. iRating limits still apply
          {leaderReg?.carClass?.shortCode === "LMP2"
            ? " (LMP2: ≥ 1500)"
            : ""}
          {" "}— max 5000 for any class. Class &amp; car have their own
          section below{classCarLocked ? " (locked — season started)" : ""}.
        </p>
        <form
          action={updateTeamRegistration}
          className="space-y-4 rounded border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="redirectTo" value={basePath} />

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              {isManager
                ? `Teamchef's current iRating (${leaderReg?.user.firstName ?? ""} ${leaderReg?.user.lastName ?? ""})`
                : "Your current iRating"}{" "}
              <span className="text-orange-400">*</span>
            </span>
            <input
              name="leaderIRating"
              type="number"
              min={0}
              max={20000}
              required
              defaultValue={leaderReg?.iRating ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm text-zinc-300">
              Teammates (up to 4)
            </legend>
            <p className="text-xs text-zinc-500">
              Add a brand-new driver to add a teammate (their Invite/Accepted
              flags reset). Clear a row to withdraw that teammate. Existing
              teammates keep their flags when their data is unchanged.
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
                    const pre = teammates[i - 1] ?? null;
                    const preName = pre
                      ? `${pre.user.firstName ?? ""} ${pre.user.lastName ?? ""}`.trim()
                      : "";
                    const preIr = pre?.user.iracingMemberId ?? "";
                    const preEmail = pre?.user.email ?? "";
                    const preRating = pre?.iRating ?? "";
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
                            defaultValue={preRating}
                            placeholder="2400"
                            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            name={`teammate${i}Email`}
                            type="email"
                            defaultValue={preEmail}
                            placeholder="optional"
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
          <TeamIRatingValidator
            lockedClassShortCode={leaderReg?.carClass?.shortCode}
          />

          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* === Class & car (until the first race has started) === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Class &amp; car
        </h2>
        {classCarLocked && !isAdmin ? (
          <p className="rounded border border-zinc-800 bg-zinc-900/50 p-4 text-sm text-zinc-400">
            The season has started — class and car are locked. Current:{" "}
            <strong className="text-zinc-200">
              {leaderReg?.carClass?.name ?? "—"} · {leaderReg?.car?.name ?? "—"}
            </strong>
            . Contact an admin if a change is still needed.
          </p>
        ) : (
          <>
            <p className="mb-3 text-xs text-zinc-500">
              Changing class or car applies to the whole team (every driver).
              Possible until the first race of the season has started.
              {classCarLocked && isAdmin && (
                <span className="text-amber-300">
                  {" "}Season has started — visible to you as admin only.
                </span>
              )}
            </p>
            <form
              action={updateTeamClassCar}
              className="space-y-4 rounded border border-zinc-800 bg-zinc-900/50 p-4"
            >
              <input type="hidden" name="teamId" value={team.id} />
              <input type="hidden" name="redirectTo" value={basePath} />
              <TeamClassCarSelect
                carClasses={carClassesForSelect}
                defaultClassId={leaderReg?.carClassId ?? teammates[0]?.carClassId ?? undefined}
                defaultCarId={leaderReg?.carId ?? teammates[0]?.carId ?? undefined}
              />
              <SubmitWithSpinner
                label="Change class / car"
                className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
              />
            </form>
          </>
        )}
      </section>

      {/* === Transfer leadership === */}
      {teammates.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            {isManager ? "Change Teamchef" : "Transfer leadership"}
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            {isManager
              ? "Pick the driver who should be Teamchef. You stay team manager; the previous Teamchef stays a regular driver."
              : "Pick a teammate to take over as team leader. Your registration will be withdrawn. The new leader can manage the team afterwards."}
          </p>
          <form
            action={transferTeamLeadership}
            className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <input type="hidden" name="redirectTo" value={basePath} />
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">
                New leader
              </span>
              <select
                name="newLeaderUserId"
                required
                defaultValue=""
                className="w-64 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              >
                <option value="" disabled>
                  Choose teammate…
                </option>
                {teammates.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.user.firstName} {r.user.lastName}
                    {r.user.iracingMemberId
                      ? ` (iR ${r.user.iracingMemberId})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/50"
            >
              {isManager ? "Set as Teamchef" : "Transfer + withdraw me"}
            </button>
          </form>
        </section>
      )}

      {/* === Team manager (assign / remove) — Teamchef or admin === */}
      {(isLeader || isAdmin) && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Team manager
          </h2>
          {managerUser ? (
            <div className="flex flex-wrap items-center gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
              <p className="text-sm">
                <span className="text-cyan-300">◆</span>{" "}
                <strong>
                  {managerUser.firstName} {managerUser.lastName}
                </strong>{" "}
                <span className="text-zinc-500">
                  manages this team (not driving).
                </span>
              </p>
              <form action={removeTeamManager}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="redirectTo" value={basePath} />
                <button
                  type="submit"
                  className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-900/50"
                >
                  Remove manager
                </button>
              </form>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                Assign a Teammanager. They get the same management rights as
                you (edit lineup, change Teamchef), don&apos;t count against
                the driver limit and don&apos;t appear in this team&apos;s
                driver roster. They may drive for another team and manage
                several teams — but not drive for a team they manage. The
                person must have signed in to CLS with Discord at least once.
              </p>
              <form
                action={assignTeamManager}
                className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
              >
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="redirectTo" value={basePath} />
                <div className="block">
                  <span className="mb-1 block text-xs text-zinc-400">
                    Search the manager&apos;s CLS account
                  </span>
                  <UserSearchPicker name="managerUserId" />
                </div>
                <button
                  type="submit"
                  className="rounded border border-cyan-700/50 bg-cyan-950/30 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-900/50"
                >
                  Assign manager
                </button>
              </form>
            </>
          )}
        </section>
      )}

      {/* === Withdraw team === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Withdraw entire team
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Marks every team member&apos;s registration as withdrawn. The team
          will no longer appear on the roster. Cannot be undone from here —
          contact admin if needed.
        </p>
        <form
          action={withdrawTeam}
          className="rounded border border-red-900/40 bg-red-950/20 p-4"
        >
          <input type="hidden" name="teamId" value={team.id} />
          <input type="hidden" name="redirectTo" value={basePath} />
          <button
            type="submit"
            className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200 hover:bg-red-900/60"
          >
            Withdraw the whole team
          </button>
        </form>
      </section>
    </div>
  );
}
