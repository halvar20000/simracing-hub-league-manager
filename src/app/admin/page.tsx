import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const [leagueCount, seasonCount, roundCount, userCount, scoringCount] =
    await Promise.all([
      prisma.league.count(),
      prisma.season.count(),
      prisma.round.count(),
      prisma.user.count(),
      prisma.scoringSystem.count(),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Leagues" value={leagueCount} />
        <Stat label="Seasons" value={seasonCount} />
        <Stat label="Rounds" value={roundCount} />
        <Stat label="Users" value={userCount} />
        <Stat label="Scoring systems" value={scoringCount} />
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link
              href="/admin/leagues"
              className="text-orange-400 hover:underline"
            >
              Manage leagues and seasons →
            </Link>
          </li>
          <li>
            <Link
              href="/admin/leagues/new"
              className="text-orange-400 hover:underline"
            >
              Create a new league →
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}
