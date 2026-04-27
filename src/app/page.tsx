import Link from "next/link";
import { auth, signIn } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  const session = await auth();
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
      _count: { select: { seasons: true } },
    },
  });

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-black p-8 md:p-12">
        <div className="grid items-center gap-8 md:grid-cols-[auto_1fr]">
          <img
            src="/logos/cas-community.webp"
            alt="CAS iRacing Community"
            className="mx-auto h-32 w-32 object-contain md:mx-0 md:h-40 md:w-40"
          />
          <div>
            <span className="tag tag-orange">CAS iRacing Community</span>
            <h1 className="mt-3 font-display text-4xl font-bold tracking-tight md:text-5xl">
              League Manager
            </h1>
            <p className="mt-3 max-w-xl text-zinc-400 md:text-lg">
              Six community championships. Live standings, race-by-race
              results, Fair Play Rating, and team scoring — all in one place.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/leagues"
                className="rounded bg-[#ff6b35] px-6 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
              >
                Browse leagues →
              </Link>
              {!session && (
                <form
                  action={async () => {
                    "use server";
                    await signIn("discord");
                  }}
                >
                  <button
                    type="submit"
                    className="rounded border border-zinc-700 bg-zinc-900 px-6 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-800"
                  >
                    Sign in with Discord
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* League grid */}
      <section>
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="font-display text-2xl font-bold">Championships</h2>
          <Link
            href="/leagues"
            className="text-sm text-[#ff6b35] hover:underline"
          >
            All leagues →
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/leagues/${league.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/40 transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
              >
                <div className="flex h-40 items-center justify-center bg-gradient-to-br from-zinc-900 to-black p-6">
                  {league.logoUrl ? (
                    <img
                      src={league.logoUrl}
                      alt={league.name}
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <span className="font-display text-2xl text-zinc-700">
                      {league.name}
                    </span>
                  )}
                </div>
                <div className="border-t border-zinc-800 p-4">
                  <h3 className="font-display text-lg font-semibold tracking-wide group-hover:text-[#ff6b35]">
                    {league.name}
                  </h3>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-zinc-500">
                      {league._count.seasons} season
                      {league._count.seasons === 1 ? "" : "s"}
                    </span>
                    {activeSeason && (
                      <span className="tag tag-orange">
                        {activeSeason.name} {activeSeason.year}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
