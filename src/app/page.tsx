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
    <div className="space-y-4">
      {/* Tight one-line hero */}
      <section className="flex flex-wrap items-center gap-2 rounded border border-zinc-800 bg-gradient-to-br from-zinc-900 to-black px-3 py-2">
        <img
          src="/logos/cas-community.webp"
          alt="CAS Community"
          className="h-9 w-9 shrink-0 object-contain"
        />
        <h1 className="flex-1 font-display text-base font-bold tracking-tight">
          CAS Community League Manager
        </h1>
        <div className="flex gap-1.5">
          <Link
            href="/leagues"
            className="rounded bg-[#ff6b35] px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-[#ff8550]"
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
                className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-200 hover:bg-zinc-800"
              >
                Sign in
              </button>
            </form>
          )}
        </div>
      </section>

      {/* 6-up flat league grid with 15px logos */}
      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Championships
        </h2>
        <div className="grid grid-cols-3 gap-1.5 md:grid-cols-6">
          {leagues.map((league) => {
            const activeSeason = league.seasons[0];
            return (
              <Link
                key={league.id}
                href={`/leagues/${league.slug}`}
                className="group flex flex-col items-center gap-1 rounded border border-zinc-800 bg-zinc-900/40 px-2 py-1.5 text-center transition-colors hover:border-[#ff6b35] hover:bg-zinc-900"
                title={league.name}
              >
                {league.logoUrl ? (
                  <img
                    src={league.logoUrl}
                    alt={league.name}
                    className="h-9 w-full object-contain"
                  />
                ) : (
                  <div className="h-9 w-full rounded bg-zinc-800" />
                )}
                <div className="w-full">
                  <div className="truncate font-display text-[10px] font-semibold tracking-wide group-hover:text-[#ff6b35]">
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
