import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function Nav() {
  const session = await auth();

  // Re-fetch user role so the Admin link appears correctly even if the
  // session was cached before the role changed.
  let isAdmin = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    isAdmin = user?.role === "ADMIN";
  }

  return (
    <nav className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Simracing-Hub&apos;s League Manager
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/leagues" className="hover:text-orange-400">
            Leagues
          </Link>
          {isAdmin && (
            <Link href="/admin" className="hover:text-orange-400">
              Admin
            </Link>
          )}
          {session?.user ? (
            <>
              <span className="text-zinc-400">
                {session.user.name ?? session.user.email}
              </span>
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="rounded bg-zinc-800 px-3 py-1.5 hover:bg-zinc-700"
                >
                  Sign out
                </button>
              </form>
            </>
          ) : (
            <form
              action={async () => {
                "use server";
                await signIn("discord");
              }}
            >
              <button
                type="submit"
                className="rounded bg-indigo-600 px-3 py-1.5 font-medium hover:bg-indigo-500"
              >
                Sign in with Discord
              </button>
            </form>
          )}
        </div>
      </div>
    </nav>
  );
}
