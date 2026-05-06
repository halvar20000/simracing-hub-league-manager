import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  updateTeamRegistration,
  withdrawTeam,
  transferTeamLeadership,
} from "@/lib/actions/registrations";

export default async function ManageTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=/teams/${teamId}/manage`
    );
  }

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

  const isLeader = team.leaderUserId === session.user.id;
  const leaderReg = team.registrations.find(
    (r) => r.userId === team.leaderUserId
  );
  const teammates = team.registrations.filter(
    (r) => r.userId !== team.leaderUserId && r.status !== "WITHDRAWN"
  );

  if (!isLeader) {
    return (
      <div className="space-y-4">
        <Link
          href="/registrations"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← My registrations
        </Link>
        <h1 className="text-2xl font-bold">Team management</h1>
        <p className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          Only the current team leader can manage this team. The leader is{" "}
          <strong>
            {team.registrations.find((r) => r.userId === team.leaderUserId)
              ?.user.firstName}{" "}
            {team.registrations.find((r) => r.userId === team.leaderUserId)
              ?.user.lastName}
          </strong>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/registrations"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← My registrations
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Manage team</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {team.name} · {team.season.league.name} {team.season.name}{" "}
          {team.season.year} · {leaderReg?.carClass?.name} ·{" "}
          {leaderReg?.car?.name}
        </p>
      </div>

      {/* === Update form === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Edit team
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Class and car cannot be changed here. To change them, withdraw the
          team and re-register. iRating limits still apply
          {leaderReg?.carClass?.shortCode === "LMP2"
            ? " (LMP2: ≥ 1500)"
            : ""}
          {" "}— max 5000 for any class.
        </p>
        <form
          action={updateTeamRegistration}
          className="space-y-4 rounded border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <input type="hidden" name="teamId" value={team.id} />

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

          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* === Transfer leadership === */}
      {teammates.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Transfer leadership
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Pick a teammate to take over as team leader. Your registration
            will be withdrawn. The new leader can manage the team afterwards.
          </p>
          <form
            action={transferTeamLeadership}
            className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <input type="hidden" name="teamId" value={team.id} />
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
              Transfer + withdraw me
            </button>
          </form>
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
