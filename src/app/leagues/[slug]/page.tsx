import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicLeagueDetail({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await prisma.league.findUnique({
    where: { slug },
    include: {
      seasons: {
        orderBy: [{ year: "desc" }, { name: "asc" }],
        include: {
          scoringSystem: { select: { name: true } },
          _count: { select: { rounds: true, registrations: true } },
        },
      },
    },
  });

  if (!league) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/leagues"
        className="text-sm text-zinc-400 hover:text-zinc-200"
      >
        ← All leagues
      </Link>

      {/* Compact corner header */}
      <div className="flex items-center gap-4">
        {league.logoUrl && (
          <img
            src={league.logoUrl}
            alt={league.name}
            className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
          />
        )}
        <div>
          <span className="tag tag-orange">CAS Community</span>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">
            {league.name}
          </h1>
          {league.description && (
            <p className="mt-1 text-sm text-zinc-400">{league.description}</p>
          )}
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Seasons</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {league.seasons.map((s) => (
            <Link
              key={s.id}
              href={`/leagues/${league.slug}/seasons/${s.id}`}
              className="block rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-display text-lg font-semibold tracking-wide">
                  {s.name} {s.year}
                </h3>
                <span className="tag tag-zinc">
                  {s.status.replace("_", " ")}
                </span>
              </div>
              <p className="mt-2 text-sm text-zinc-400">
                {s.scoringSystem.name} • {s._count.rounds} round
                {s._count.rounds === 1 ? "" : "s"} • {s._count.registrations}{" "}
                driver{s._count.registrations === 1 ? "" : "s"}
              </p>
            </Link>
          ))}
          {league.seasons.length === 0 && (
            <p className="text-zinc-500">No seasons yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
