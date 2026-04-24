import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-4xl font-bold tracking-tight">
          Simracing-Hub's League Manager
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-zinc-400">
          League management for iRacing communities. Registrations, seasons,
          results, standings, team ratings, and incident reporting — all in one
          place.
        </p>
      </section>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Phase 1 in progress</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Skeleton deployed. Sign in with Discord to continue. Full league and
          season setup is coming in the following weeks.
        </p>
      </section>

      {session?.user && (
        <section className="rounded border border-emerald-800 bg-emerald-950 p-6">
          <h2 className="text-lg font-semibold text-emerald-300">
            You&apos;re signed in
          </h2>
          <p className="mt-2 text-sm text-emerald-200">
            Welcome, {session.user.name ?? session.user.email}. Your role is{" "}
            <code className="rounded bg-emerald-900 px-1.5 py-0.5">
              {session.user.role}
            </code>
            .
          </p>
        </section>
      )}
    </div>
  );
}
