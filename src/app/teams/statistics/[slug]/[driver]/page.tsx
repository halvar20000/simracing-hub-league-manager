import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { pageMetadata } from "@/lib/og";
import { getStintPlanViewer } from "@/lib/stint-plan-access";
import {
  groupFromSlug,
  driverStats,
  iracingIdForDriver,
  canSeeTeamStats,
} from "@/lib/team-stats";
import DriverStatsView from "@/components/DriverStatsView";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; driver: string }>;
}): Promise<Metadata> {
  const { slug, driver } = await params;
  return pageMetadata({
    title: "Fahrerstatistik",
    description:
      "Alle ausgewerteten Rennen eines Fahrers im Team — nur für das Team selbst und Admins.",
    url: `/teams/statistics/${slug}/${driver}`,
  });
}

export default async function DriverStatsPage({
  params,
}: {
  params: Promise<{ slug: string; driver: string }>;
}) {
  const { slug, driver } = await params;

  const viewer = await getStintPlanViewer();
  if (!viewer) {
    redirect(
      `/api/auth/signin?callbackUrl=${encodeURIComponent(
        `/teams/statistics/${slug}/${driver}`
      )}`
    );
  }

  const group = await groupFromSlug(slug);
  if (!group) notFound();

  // Exactly the team's own rule — a driver's numbers are as private as the
  // team statistic they come from.
  if (!(await canSeeTeamStats(group, viewer))) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16 text-center">
        <h1 className="mb-3 text-2xl font-bold">
          Diese Statistik gehört einem anderen Team
        </h1>
        <Link
          href="/teams/statistics"
          className="rounded border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
        >
          ← Deine Team-Statistiken
        </Link>
      </main>
    );
  }

  const key = decodeURIComponent(driver);
  const stats = await driverStats(group, key);
  if (!stats) notFound();
  const iracingMemberId = await iracingIdForDriver(key);

  return (
    <main className="mx-auto max-w-6xl px-6 py-8 print:max-w-none print:px-0 print:py-0">
      <div className="mb-4 text-sm print:hidden">
        <Link
          href={`/teams/statistics/${slug}`}
          className="text-zinc-400 hover:text-[#ff6b35]"
        >
          ← {stats.groupName}
        </Link>
      </div>
      <DriverStatsView
        stats={{
          ...stats,
          iracingMemberId,
          races: stats.races.map((r) => ({
            ...r,
            racedAtMs: r.racedAt.getTime(),
          })),
          stints: stats.stints.map((s) => ({
            ...s,
            racedAtMs: s.racedAt.getTime(),
          })),
        }}
      />
    </main>
  );
}
