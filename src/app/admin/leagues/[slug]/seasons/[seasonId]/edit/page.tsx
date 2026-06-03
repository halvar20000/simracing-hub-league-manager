import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSeason } from "@/lib/actions/seasons";

export default async function EditSeasonPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  await requireAdmin();
  const { slug, seasonId } = await params;

  const [season, scoringSystems] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: { league: true },
    }),
    prisma.scoringSystem.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!season || season.league.slug !== slug) notFound();

  const update = updateSeason.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Season</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Season name</span>
          <input
            name="name"
            required
            defaultValue={season.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Year</span>
          <input
            name="year"
            type="number"
            required
            defaultValue={season.year}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={season.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="DRAFT">Draft</option>
            <option value="OPEN_REGISTRATION">Open registration</option>
            <option value="ACTIVE">Active</option>
            <option value="PAUSED">Paused (on hold)</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <span className="mt-1 block text-xs text-zinc-500">
            <strong>Paused</strong> keeps the season and all its data, but stops
            reporting-window and RSVP Discord announcements and closes
            registration. Switch back to <strong>Active</strong> to resume.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            name="scoringSystemId"
            defaultValue={season.scoringSystemId}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            {scoringSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="isMulticlass"
            defaultChecked={season.isMulticlass}
          />
          Multiclass season
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="proAmEnabled"
            defaultChecked={season.proAmEnabled}
          />
          Pro/Am split enabled
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="gdcEnabled"
            defaultChecked={season.gdcEnabled}
          />
          Gentleman Driver Class (GDC) enabled
        </label>
        <p className="-mt-2 text-xs text-zinc-500">
          A parallel, opt-in class scored alongside Pro/Am. Flag drivers into
          it on the roster; configure its points table on the scoring system.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team scoring mode
          </span>
          <select
            name="teamScoringMode"
            defaultValue={season.teamScoringMode}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="NONE">None</option>
            <option value="SUM_ALL">Sum all drivers</option>
            <option value="SUM_BEST_N">Sum best N drivers per race</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Best-N value
          </span>
          <input
            name="teamScoringBestN"
            type="number"
            defaultValue={season.teamScoringBestN ?? 2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team weeks counted (best N rounds, optional)
          </span>
          <input
            name="teamScoringWeeksCounted"
            type="number"
            min={1}
            max={50}
            step={1}
            defaultValue={season.teamScoringWeeksCounted ?? ""}
            placeholder="e.g. 9 — match iRLM's drop-weeks"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Keep only each team&apos;s best N round contributions for the team
            championship. Blank = count all rounds. iRLM calls this
            &quot;Weeks counted&quot;.
          </span>
        </label>

        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="teamScoringRawOnly"
            value="1"
            defaultChecked={season.teamScoringRawOnly}
            className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 text-orange-500 focus:ring-orange-500"
          />
          <span className="text-sm text-zinc-300">
            Team scoring uses raw position points only
          </span>
        </label>
        <p className="-mt-2 text-xs text-zinc-500">
          When checked, the team championship ignores participation points
          and manual penalty deductions — driver round contribution =
          rawPointsAwarded only. Matches iRLM&apos;s &quot;Combined / Raw
          Results / Bonus: None&quot;.
        </p>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Maximum drivers per team (optional)
          </span>
          <input
            name="teamMaxDrivers"
            type="number"
            min={1}
            max={20}
            step={1}
            defaultValue={season.teamMaxDrivers ?? ""}
            placeholder="e.g. 3 (team leader + 2 teammates)"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Hard cap on drivers per team — counts the team leader. IEC uses 3
            (leader + 2 teammates). Leave blank for no per-team cap (CAS GT3
            WCT seasons stay capped at 3 via the legacy slug rule even when
            this field is blank).
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Maximum drivers (grid cap, optional)
          </span>
          <input
            name="maxDrivers"
            type="number"
            min={1}
            max={999}
            step={1}
            defaultValue={season.maxDrivers ?? ""}
            placeholder="e.g. 50"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Shown on the RSVP Discord embed as &quot;max. N drivers can register&quot;.
            Leave blank to hide.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Season poster URL
          </span>
          <input
            name="scheduleImageUrl"
            type="text"
            defaultValue={season.scheduleImageUrl ?? ""}
            placeholder="https://… or /schedules/your-poster.png"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Used as the background of the season page and linked as
            &quot;Full schedule poster&quot;. Either a full https URL or an
            app-relative path (e.g. <code>/schedules/cas-gt3-wct-season-13.png</code>).
          </span>
          {season.scheduleImageUrl && (
            <div className="mt-2 inline-block overflow-hidden rounded border border-zinc-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={season.scheduleImageUrl}
                alt="Current season poster"
                className="block max-h-40 object-contain"
              />
            </div>
          )}
        </label>

        <fieldset className="rounded border border-zinc-800 bg-zinc-900/40 p-3">
          <legend className="px-2 text-xs uppercase tracking-wider text-zinc-500">iRLeagueManager bridge</legend>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">iRLM league name (URL slug)</span>
            <input
              name="irlmLeagueName"
              defaultValue={season.irlmLeagueName ?? ""}
              placeholder="e.g. casgt3wct"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>
          <label className="mt-3 block">
            <span className="mb-1 block text-sm text-zinc-300">iRLM season ID</span>
            <input
              name="irlmSeasonId"
              type="number"
              defaultValue={season.irlmSeasonId ?? ""}
              placeholder="123"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            <span className="mt-1 block text-xs text-zinc-500">Reference only — used by future cron sync.</span>
          </label>
        </fieldset>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
