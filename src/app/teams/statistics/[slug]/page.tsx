import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import { getStintPlanViewer } from "@/lib/stint-plan-access";
import { groupFromSlug, teamStats, canSeeTeamStats } from "@/lib/team-stats";
import TeamStatsView from "@/components/TeamStatsView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata({
    title: "Team-Statistik",
    description:
      "Fahrerstatistik über alle ausgewerteten Rennen — nur für das Team selbst und Admins.",
    url: `/teams/statistics/${slug}`,
  });
}

export default async function TeamStatsPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const viewer = await getStintPlanViewer();
  if (!viewer) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        `/teams/statistics/${slug}`
      )}`
    );
  }

  const group = await groupFromSlug(slug);
  if (!group) notFound();

  if (!(await canSeeTeamStats(group, viewer))) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">
          Diese Statistik gehört einem anderen Team
        </h1>
        <p className="mb-6 text-sm text-zinc-400">
          Eine Team-Statistik können nur die Fahrer dieses Teams und CLS-Admins
          öffnen.
        </p>
        <Link
          href="/teams/statistics"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Deine Team-Statistiken
        </Link>
      </main>
    );
  }

  const stats = await teamStats(group);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 text-sm print:hidden">
        <Link
          href="/teams/statistics"
          className="text-zinc-400 hover:text-[#ff6b35]"
        >
          ← Alle Team-Statistiken
        </Link>
      </div>
      <TeamStatsView
        stats={{
          ...stats,
          races: stats.races.map((r) => ({
            ...r,
            racedAtMs: r.racedAt.getTime(),
          })),
        }}
      />
    </main>
  );
}
