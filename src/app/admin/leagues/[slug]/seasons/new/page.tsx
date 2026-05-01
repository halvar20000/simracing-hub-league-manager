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
      <div className="space-y-6 max-w-5xl">
        <nav className="text-sm text-zinc-500">
          <Link
            href={`/admin/leagues/${slug}`}
            className="hover:text-zinc-200"
          >
            ← {league.name}
          </Link>
          <span className="mx-2">/</span>
          New season
        </nav>

        <div>
          <h1 className="text-2xl font-bold">New season for {league.name}</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Pick a template that matches the format of this season. The matching
            scoring system will be created automatically — you can still adjust
            everything afterwards.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {SEASON_TEMPLATES.map((t) => (
            <Link
              key={t.id}
              href={`/admin/leagues/${slug}/seasons/new?template=${t.id}`}
              className="block rounded-lg border border-zinc-800 bg-zinc-900/40 p-5 transition hover:border-orange-500/60 hover:bg-zinc-900"
            >
              <div className="text-xs font-semibold uppercase tracking-wide text-orange-400">
                {t.id === "sprint" && "2 races / round"}
                {t.id === "endurance" && "1 race / round"}
                {t.id === "endurance-pro-am" && "Pro / Am"}
                {t.id === "team-endurance" && "Team event"}
              </div>
              <h2 className="mt-1 text-lg font-semibold text-zinc-100">
                {t.label}
              </h2>
              <p className="mt-1 text-sm text-zinc-400">{t.tagline}</p>
              <p className="mt-3 text-sm text-zinc-300">{t.description}</p>
              {t.examples.length > 0 && (
                <p className="mt-3 text-xs text-zinc-500">
                  Used by: {t.examples.join(", ")}
                </p>
              )}
            </Link>
          ))}
        </div>

        <div className="text-sm text-zinc-500">
          Want to start from a custom configuration?{" "}
          <Link
            href={`/admin/leagues/${slug}/seasons/new?template=custom`}
            className="text-orange-400 hover:underline"
          >
            Use a manual setup instead.
          </Link>
        </div>
      </div>
    );
  }

  // ---------- Step 2: Pre-filled form (template chosen) ----------
  const scoringSystems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const isCustom = sp.template === "custom";
  const labelFor = isCustom ? "Custom (no template)" : tpl.label;
  const action = createSeason.bind(null, slug);
  const defaultYear = new Date().getFullYear();

  return (
    <div className="space-y-6 max-w-3xl">
      <nav className="text-sm text-zinc-500">
        <Link
          href={`/admin/leagues/${slug}`}
          className="hover:text-zinc-200"
        >
          ← {league.name}
        </Link>
        <span className="mx-2">/</span>
        <Link
          href={`/admin/leagues/${slug}/seasons/new`}
          className="hover:text-zinc-200"
        >
          New season
        </Link>
        <span className="mx-2">/</span>
        {labelFor}
      </nav>

      <div>
        <h1 className="text-2xl font-bold">New season — {labelFor}</h1>
        {!isCustom && (
          <p className="mt-2 text-sm text-zinc-400">{tpl.description}</p>
        )}
      </div>

      {sp.error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {sp.error}
        </div>
      )}

      <form
        action={action}
        className="space-y-5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-6"
      >
        {!isCustom && <input type="hidden" name="template" value={tpl.id} />}

        <Field
          label="Season name"
          name="name"
          required
          placeholder='e.g. "Season 5", "Spring 2026"'
        />

        <Field
          label="Year"
          name="year"
          type="number"
          required
          defaultValue={String(defaultYear)}
        />

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            id="scoringSystemId"
            name="scoringSystemId"
            defaultValue=""
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
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
            <span className="mt-1 block text-xs text-zinc-500">
              Leave the first option selected to create a new scoring system
              with the template defaults. You can adjust it afterwards under
              Admin → Scoring systems.
            </span>
          )}
        </label>

        <fieldset className="rounded border border-zinc-800 p-4">
          <legend className="px-2 text-sm font-semibold text-zinc-300">
            Season options
          </legend>
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                name="isMulticlass"
                defaultChecked={!isCustom && tpl.isMulticlass}
                className="h-4 w-4 accent-orange-500"
              />
              Multi-class season
            </label>

            <label className="flex items-center gap-2 text-sm text-zinc-200">
              <input
                type="checkbox"
                name="proAmEnabled"
                defaultChecked={!isCustom && tpl.proAmEnabled}
                className="h-4 w-4 accent-orange-500"
              />
              Pro / Am sub-classification
            </label>

            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Team scoring
              </span>
              <select
                name="teamScoringMode"
                defaultValue={isCustom ? "NONE" : tpl.teamScoringMode}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
              >
                <option value="NONE">None (drivers championship only)</option>
                <option value="SUM_ALL">Sum of all drivers per round</option>
                <option value="SUM_BEST_N">
                  Sum of best N drivers per round
                </option>
              </select>
            </label>

            <Field
              label="Team scoring: best N (only if mode is 'best N')"
              name="teamScoringBestN"
              type="number"
              min={1}
              defaultValue={
                !isCustom && tpl.teamScoringBestN !== null
                  ? String(tpl.teamScoringBestN)
                  : ""
              }
            />
          </div>
        </fieldset>

        {!isCustom && (
          <div className="rounded border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-400">
            <strong className="text-zinc-200">Template defaults:</strong>{" "}
            {tpl.scoringSystem.racesPerRound} race
            {tpl.scoringSystem.racesPerRound > 1 ? "s" : ""}/round, points{" "}
            {tpl.scoringSystem.pointsTable.slice(0, 5).join("-")}…, drop{" "}
            {tpl.scoringSystem.dropWorstNRounds ?? "none"}, ≥
            {tpl.scoringSystem.racePointsMinDistancePct}% distance for race
            points.
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create season
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/new`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            ← Pick another template
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  placeholder,
  defaultValue,
  min,
}: {
  label: string;
  name: string;
  type?: "text" | "number";
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
  min?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        min={min}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
      />
    </label>
  );
}
