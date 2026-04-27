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
    <div className="space-y-8">
      <div>
        <Link
          href="/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← All leagues
        </Link>
        <div className="mt-3 flex flex-col items-center gap-6 rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black p-8 sm:flex-row sm:gap-8 sm:p-10">
          {league.logoUrl ? (
            <img
              src={league.logoUrl}
              alt={league.name}
              className="h-32 w-32 object-contain sm:h-40 sm:w-40"
            />
          ) : null}
          <div className="text-center sm:text-left">
            <span className="tag tag-orange">CAS Community</span>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              {league.name}
            </h1>
            {league.description && (
              <p className="mt-2 text-zinc-400">{league.description}</p>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-xl font-bold">Seasons</h2>
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
