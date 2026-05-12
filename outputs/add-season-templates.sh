#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Create src/lib/league-templates.ts with the 4 templates
# ---------------------------------------------------------------------------
mkdir -p src/lib
cat > src/lib/league-templates.ts <<'TS'
import type { TeamScoringMode } from "@prisma/client";

/**
 * Season templates — pick a template when creating a new season and the
 * matching ScoringSystem + season flags are pre-filled.
 *
 * The admin can still edit any field on the form before creating, and can
 * always change the ScoringSystem after creation.
 */

export type SeasonTemplateId =
  | "sprint"
  | "endurance"
  | "endurance-pro-am"
  | "team-endurance";

export interface SeasonTemplate {
  id: SeasonTemplateId;
  label: string;
  tagline: string;
  description: string;
  examples: string[];

  // Season flags
  isMulticlass: boolean;
  proAmEnabled: boolean;
  teamScoringMode: TeamScoringMode;
  teamScoringBestN: number | null;

  // Default ScoringSystem to auto-create
  scoringSystem: {
    name: string;
    racesPerRound: number;
    pointsTable: number[];
    pointsTableRace2: number[] | null;
    participationPoints: number;
    participationInCombined: boolean;
    racePointsMinDistancePct: number;
    qualifyingFastestPolePoints: number;
    fastestRacePoints: number;
    dropWorstNRounds: number | null;
    dsqPenaltyPoints: number;
  };
}

const SPRINT_R1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const SPRINT_R2 = [30, 25, 20, 15, 12, 10, 8, 6, 4, 2];
const ENDURANCE = [35, 30, 27, 25, 23, 21, 19, 17, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export const SEASON_TEMPLATES: SeasonTemplate[] = [
  {
    id: "sprint",
    label: "Sprint Series (2 races / round)",
    tagline: "Two short races per round, combined results",
    description:
      "Two sprint races per round with separate points tables. Combined standings sum both races. Drop the worst round.",
    examples: ["Combined Cup", "PCCD", "SFL Cup"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Sprint (2 races / round)",
      racesPerRound: 2,
      pointsTable: SPRINT_R1,
      pointsTableRace2: SPRINT_R2,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      qualifyingFastestPolePoints: 1,
      fastestRacePoints: 0,
      dropWorstNRounds: 1,
      dsqPenaltyPoints: 0,
    },
  },
  {
    id: "endurance",
    label: "Endurance Series (1 long race)",
    tagline: "Single long race per round",
    description:
      "One race per round, F1-style points table, 75% finish bonus. Drop one worst round.",
    examples: ["CAS TSS GT4"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Endurance (1 race / round)",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      qualifyingFastestPolePoints: 1,
      fastestRacePoints: 0,
      dropWorstNRounds: 1,
      dsqPenaltyPoints: 0,
    },
  },
  {
    id: "endurance-pro-am",
    label: "Endurance with Pro / Am",
    tagline: "Endurance + Pro/Am class split",
    description:
      "Single endurance race per round with Pro/Am class re-ranking. Drop the three worst rounds.",
    examples: ["CAS GT3 WCT"],
    isMulticlass: true,
    proAmEnabled: true,
    teamScoringMode: "NONE",
    teamScoringBestN: null,
    scoringSystem: {
      name: "Endurance Pro/Am",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      qualifyingFastestPolePoints: 1,
      fastestRacePoints: 0,
      dropWorstNRounds: 3,
      dsqPenaltyPoints: 0,
    },
  },
  {
    id: "team-endurance",
    label: "Team Endurance (IEC-style)",
    tagline: "Long endurance race scored as a team championship",
    description:
      "One long endurance race per round, team scoring with best-N drivers per team. No round drops.",
    examples: ["CAS IEC"],
    isMulticlass: false,
    proAmEnabled: false,
    teamScoringMode: "SUM_BEST_N",
    teamScoringBestN: 4,
    scoringSystem: {
      name: "Team Endurance",
      racesPerRound: 1,
      pointsTable: ENDURANCE,
      pointsTableRace2: null,
      participationPoints: 1,
      participationInCombined: true,
      racePointsMinDistancePct: 50,
      qualifyingFastestPolePoints: 1,
      fastestRacePoints: 0,
      dropWorstNRounds: null,
      dsqPenaltyPoints: 0,
    },
  },
];

export function getTemplate(id: string | null | undefined): SeasonTemplate | null {
  if (!id) return null;
  return SEASON_TEMPLATES.find((t) => t.id === id) ?? null;
}
TS

echo "[+] Wrote src/lib/league-templates.ts"

# ---------------------------------------------------------------------------
# 2. Rewrite src/lib/actions/seasons.ts to support template auto-creation
# ---------------------------------------------------------------------------
cat > src/lib/actions/seasons.ts <<'TS'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { SeasonStatus, TeamScoringMode } from "@prisma/client";
import { getTemplate } from "@/lib/league-templates";

export async function createSeason(leagueSlug: string, formData: FormData) {
  await requireAdmin();

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
  });
  if (!league) redirect("/admin/leagues");

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  let scoringSystemId = String(formData.get("scoringSystemId") ?? "").trim();
  const templateId = String(formData.get("template") ?? "").trim() || null;
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  // If a template is chosen and no existing scoring system was selected,
  // auto-create a new ScoringSystem from the template defaults.
  if (!scoringSystemId && templateId) {
    const tpl = getTemplate(templateId);
    if (!tpl) {
      redirect(
        `/admin/leagues/${leagueSlug}/seasons/new?error=Unknown+template`
      );
    }
    const t = tpl!;
    // Distinguish the auto-created system per league/season name so admins
    // can find it later.
    const ssName = `${t.scoringSystem.name} – ${league.name}${name ? " / " + name : ""}`;
    const ss = await prisma.scoringSystem.create({
      data: {
        name: ssName,
        racesPerRound: t.scoringSystem.racesPerRound,
        pointsTable: t.scoringSystem.pointsTable,
        pointsTableRace2: t.scoringSystem.pointsTableRace2 ?? undefined,
        participationPoints: t.scoringSystem.participationPoints,
        participationInCombined: t.scoringSystem.participationInCombined,
        racePointsMinDistancePct: t.scoringSystem.racePointsMinDistancePct,
        qualifyingFastestPolePoints: t.scoringSystem.qualifyingFastestPolePoints,
        fastestRacePoints: t.scoringSystem.fastestRacePoints,
        dropWorstNRounds: t.scoringSystem.dropWorstNRounds,
        dsqPenaltyPoints: t.scoringSystem.dsqPenaltyPoints,
      },
    });
    scoringSystemId = ss.id;
  }

  if (!name || !year || !scoringSystemId) {
    const params = new URLSearchParams({
      error: "Name, year and scoring system are required",
    });
    if (templateId) params.set("template", templateId);
    redirect(`/admin/leagues/${leagueSlug}/seasons/new?${params.toString()}`);
  }

  const created = await prisma.season.create({
    data: {
      leagueId: league.id,
      name,
      year,
      scoringSystemId,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${created.id}`);
}

export async function updateSeason(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  const scoringSystemId = String(formData.get("scoringSystemId") ?? "");
  const status = String(formData.get("status") ?? "DRAFT") as SeasonStatus;
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  const irlmLeagueName = String(formData.get("irlmLeagueName") ?? "").trim() || null;
  const irlmSeasonIdRaw = String(formData.get("irlmSeasonId") ?? "").trim();
  const irlmSeasonId = irlmSeasonIdRaw ? parseInt(irlmSeasonIdRaw, 10) : null;

  await prisma.season.update({
    where: { id: seasonId },
    data: {
      irlmLeagueName,
      irlmSeasonId,
      name,
      year,
      scoringSystemId,
      status,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteSeason(leagueSlug: string, seasonId: string) {
  await requireAdmin();
  await prisma.season.delete({ where: { id: seasonId } });
  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}`);
}
TS

echo "[+] Wrote src/lib/actions/seasons.ts"

# ---------------------------------------------------------------------------
# 3. Rewrite src/app/admin/leagues/[slug]/seasons/new/page.tsx with picker
# ---------------------------------------------------------------------------
NEW_SEASON_PAGE='src/app/admin/leagues/[slug]/seasons/new/page.tsx'
mkdir -p "$(dirname "$NEW_SEASON_PAGE")"
cat > "$NEW_SEASON_PAGE" <<'TSX'
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
TSX

echo "[+] Wrote $NEW_SEASON_PAGE"

# ---------------------------------------------------------------------------
# 4. Sanity build check (optional — comment out if you trust deploy)
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check on changed files ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 5. Commit + push
# ---------------------------------------------------------------------------
git add -A
git commit -m "Season templates: pick Sprint / Endurance / Endurance Pro-Am / Team Endurance and auto-create matching scoring system"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Try it: /admin/leagues/<slug>/seasons/new"
