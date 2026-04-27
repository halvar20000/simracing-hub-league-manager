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
    },
  });

  return (
    <div className="space-y-5">
      {/* Tight one-line hero */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black px-4 py-3">
        <img
          src="/logos/cas-community.webp"
          alt="CAS Community"
          className="h-10 w-10 shrink-0 object-contain"
        />
        <div className="flex-1 min-w-[160px]">
          <span className="tag tag-orange">CAS Community</span>
          <h1 className="font-display text-lg font-bold tracking-tight sm:text-xl">
            League Manager
          </h1>
        </div>
        <div className="flex gap-2">
          <Link
            href="/leagues"
            className="rounded bg-[#ff6b35] px-3 py-1.5 text-sm font-semibold text-zinc-950 hover:bg-[#ff8550]"
          >
            Browse →
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
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800"
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 6-up flat league grid */}
      <section>
        <h2 className="mb-2 font-display text-sm font-semibold tracking-wider uppercase text-zinc-400">
          Championships
        </h2>
        <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/leagues/${league.slug}`}
                className="group flex flex-col items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900/40 p-2 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
                title={league.name}
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="h-8 w-full object-contain"
                  />
                ) : (
                  <div className="h-8 w-full rounded bg-zinc-800" />
                )}
                <div className="w-full">
                  <div className="truncate font-display text-[11px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
                    {league.name}
                  </div>
                  {activeSeason && (
                    <div className="truncate text-[9px] text-zinc-500">
                      {activeSeason.year}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
