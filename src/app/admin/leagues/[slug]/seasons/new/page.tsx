import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { createSeason } from "@/lib/actions/seasons";
import { SEASON_TEMPLATES, getTemplate } from "@/lib/league-templates";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ template?: string; error?: string }>;
}

export default async function NewSeasonPage({ params, searchParams }: Props) {
  await requireAdmin();
  const { slug } = await params;
  const sp = await searchParams;

  const league = await prisma.league.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!league) notFound();

  const tpl = getTemplate(sp.template);

  // ---------- Step 1: Template picker ----------
  if (!tpl) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <nav className="text-sm text-gray-500 mb-4">
          <Link href="/admin/leagues" className="hover:underline">
            Leagues
          </Link>{" "}
          /{" "}
          <Link
            href={`/admin/leagues/${slug}`}
            className="hover:underline"
          >
            {league.name}
          </Link>{" "}
          / New season
        </nav>

        <h1 className="text-2xl font-bold mb-2">New season for {league.name}</h1>
        <p className="text-gray-600 mb-8">
          Pick a template that matches the format of this season. The matching
          scoring system will be created automatically — you can still adjust
          everything afterwards.
        </p>

        <div className="grid md:grid-cols-2 gap-4">
          {SEASON_TEMPLATES.map((t) => (
            <Link
              key={t.id}
              href={`/admin/leagues/${slug}/seasons/new?template=${t.id}`}
              className="block rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow transition p-5 bg-white"
            >
              <div className="text-xs uppercase tracking-wide text-blue-600 font-semibold mb-1">
                {t.id === "sprint" && "2 races / round"}
                {t.id === "endurance" && "1 race / round"}
                {t.id === "endurance-pro-am" && "Pro / Am"}
                {t.id === "team-endurance" && "Team event"}
              </div>
              <h2 className="text-lg font-semibold">{t.label}</h2>
              <p className="text-sm text-gray-600 mt-1">{t.tagline}</p>
              <p className="text-sm text-gray-700 mt-3">{t.description}</p>
              {t.examples.length > 0 && (
                <p className="text-xs text-gray-500 mt-3">
                  Used by: {t.examples.join(", ")}
                </p>
              )}
            </Link>
          ))}
        </div>

        <div className="mt-8 text-sm text-gray-500">
          Want to start from a custom configuration?{" "}
          <Link
            href={`/admin/leagues/${slug}/seasons/new?template=custom`}
            className="text-blue-600 hover:underline"
          >
            Use a manual setup instead.
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Step 2: Pre-filled form (template chosen) ----------
  // Pull existing scoring systems so the admin can override the auto-created
  // one if they want to reuse a system from a previous season.
  const scoringSystems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isCustom = sp.template === "custom";
  const labelFor = isCustom ? "Custom (no template)" : tpl.label;
  const action = createSeason.bind(null, slug);
  const defaultYear = new Date().getFullYear();

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <nav className="text-sm text-gray-500 mb-4">
        <Link href="/admin/leagues" className="hover:underline">
          Leagues
        </Link>{" "}
        /{" "}
        <Link
          href={`/admin/leagues/${slug}`}
          className="hover:underline"
        >
          {league.name}
        </Link>{" "}
        /{" "}
        <Link
          href={`/admin/leagues/${slug}/seasons/new`}
          className="hover:underline"
        >
          New season
        </Link>{" "}
        / {labelFor}
      </nav>

      <h1 className="text-2xl font-bold mb-2">
        New season — {labelFor}
      </h1>
      {!isCustom && (
        <p className="text-gray-600 mb-6">{tpl.description}</p>
      )}

      {sp.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {sp.error}
        </div>
      )}

      <form action={action} className="space-y-5 bg-white rounded-lg border border-gray-200 p-6">
        {!isCustom && <input type="hidden" name="template" value={tpl.id} />}

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="name">
            Season name
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            placeholder='e.g. "Season 5", "Spring 2026"'
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="year">
            Year
          </label>
          <input
            id="year"
            name="year"
            type="number"
            required
            defaultValue={defaultYear}
            className="w-full border border-gray-300 rounded px-3 py-2"
          />
        </div>

        <div>
          <label
            className="block text-sm font-medium mb-1"
            htmlFor="scoringSystemId"
          >
            Scoring system
          </label>
          <select
            id="scoringSystemId"
            name="scoringSystemId"
            className="w-full border border-gray-300 rounded px-3 py-2"
            defaultValue=""
          >
            {!isCustom ? (
              <option value="">
                ▶ Auto-create from template ({tpl.scoringSystem.name})
              </option>
            ) : (
              <option value="" disabled>
                Select a scoring system…
              </option>
            )}
            {scoringSystems.map((ss) => (
              <option key={ss.id} value={ss.id}>
                {ss.name}
              </option>
            ))}
          </select>
          {!isCustom && (
            <p className="text-xs text-gray-500 mt-1">
              Leave the first option selected to create a new scoring system
              with the template defaults. You can adjust it afterwards under
              Admin → Scoring systems.
            </p>
          )}
        </div>

        <fieldset className="border border-gray-200 rounded p-4 space-y-3">
          <legend className="text-sm font-semibold px-2">Season options</legend>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isMulticlass"
              defaultChecked={!isCustom && tpl.isMulticlass}
            />
            Multi-class season
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="proAmEnabled"
              defaultChecked={!isCustom && tpl.proAmEnabled}
            />
            Pro / Am sub-classification
          </label>

          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="teamScoringMode"
            >
              Team scoring
            </label>
            <select
              id="teamScoringMode"
              name="teamScoringMode"
              defaultValue={isCustom ? "NONE" : tpl.teamScoringMode}
              className="w-full border border-gray-300 rounded px-3 py-2"
            >
              <option value="NONE">None (drivers championship only)</option>
              <option value="SUM_ALL">Sum of all drivers per round</option>
              <option value="SUM_BEST_N">Sum of best N drivers per round</option>
            </select>
          </div>

          <div>
            <label
              className="block text-sm font-medium mb-1"
              htmlFor="teamScoringBestN"
            >
              Team scoring: best N (only if mode is "best N")
            </label>
            <input
              id="teamScoringBestN"
              name="teamScoringBestN"
              type="number"
              min={1}
              defaultValue={
                !isCustom && tpl.teamScoringBestN !== null
                  ? tpl.teamScoringBestN
                  : ""
              }
              className="w-full border border-gray-300 rounded px-3 py-2"
            />
          </div>
        </fieldset>

        {!isCustom && (
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-3 border border-gray-200">
            <strong className="text-gray-700">Template defaults:</strong>{" "}
            {tpl.scoringSystem.racesPerRound} race
            {tpl.scoringSystem.racesPerRound > 1 ? "s" : ""}/round, points{" "}
            {tpl.scoringSystem.pointsTable.slice(0, 5).join("-")}…, drop{" "}
            {tpl.scoringSystem.dropWorstNRounds ?? "none"}, ≥
            {tpl.scoringSystem.racePointsMinDistancePct}% distance for race
            points.
          </div>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded"
          >
            Create season
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/new`}
            className="text-gray-600 hover:text-gray-900 px-4 py-2"
          >
            ← Pick another template
          </Link>
        </div>
      </form>
    </div>
  );
}
