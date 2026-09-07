import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import { getStintPlanViewer } from "@/lib/stint-plan-access";
import { teamGroupsWithStats, canSeeTeamStats } from "@/lib/team-stats";

export const metadata: Metadata = pageMetadata({
  title: "Team-Statistik",
  description:
    "Fahrerstatistik je Team über alle ausgewerteten Rennen — nur für das Team selbst und Admins.",
  url: "/teams/statistics",
});

export default async function TeamStatsIndex() {
  const viewer = await getStintPlanViewer();
  if (!viewer) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent("/teams/statistics")}`
    );
  }

  const all = await teamGroupsWithStats();
  const mine = [];
  for (const g of all) {
    if (await canSeeTeamStats(g.group, viewer)) mine.push(g);
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-1 text-2xl font-bold">Team-Statistik</h1>
      <p className="mb-6 max-w-2xl text-sm text-zinc-400">
        Die Fahrerauswertung deines Teams über alle Rennen, für die ein
        De-briefing erzeugt wurde. Sichtbar nur für die Fahrer des Teams und für
        Admins.
      </p>

      <p className="mb-6">
        <Link
          href="/teams/statistics/pace-references"
          className="inline-flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-700 hover:bg-zinc-900"
        >
          <span className="font-medium">Pace-Referenzen</span>
          <span className="text-xs text-zinc-500">
            welche Rundenzeit ein iRating hier wert ist — teamübergreifend
          </span>
        </Link>
      </p>

      {mine.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-zinc-400">
          Für dein Team gibt es noch keine ausgewerteten Rennen. Sie entstehen,
          sobald zu einem Stintplan ein Race-Log hochgeladen und das De-briefing
          erzeugt wurde.
        </p>
      ) : (
        <ul className="space-y-2">
          {mine.map((g) => (
            <li key={g.group}>
              <Link
                href={`/teams/statistics/${g.slug}`}
                className="flex items-center justify-between rounded border border-zinc-800 bg-zinc-950 px-4 py-3 hover:border-zinc-700 hover:bg-zinc-900"
              >
                <span className="font-medium">{g.name}</span>
                <span className="text-xs text-zinc-500">
                  {g.races} {g.races === 1 ? "Rennen" : "Rennen"} ·{" "}
                  {g.drivers} Fahrer
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
