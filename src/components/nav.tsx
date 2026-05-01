import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export default async function Nav() {
  const session = await auth();

  let isAdmin = false;
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { role: true },
    });
    isAdmin = user?.role === "ADMIN" || user?.role === "STEWARD";
  }

  return (
    <nav className="border-b border-zinc-800 bg-[#0a0a0f]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5">
        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logos/cls-league-scoring.png"
            alt="CLS — CAS League Scoring"
            className="h-12 w-auto"
          />
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-12 w-auto"
          />
          <img
            src="/logos/cas-community.webp"
            alt="CAS Racing Community"
            className="h-12 w-auto"
          />
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <NavLink href="/leagues">Leagues</NavLink>
          {session?.user && (
            <>
              <NavLink href="/registrations">My Registrations</NavLink>
              <NavLink href="/reports">My Reports</NavLink>
              <NavLink href="/profile">Profile</NavLink>
            </>
          )}
          {isAdmin && <NavLink href="/admin">Admin</NavLink>}
          <div className="ml-2">
            {session?.user ? (
              <form
                action={async () => {
                  "use server";
                  await signOut();
                }}
              >
                <button
                  type="submit"
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
                >
                  Sign out
                </button>
              </form>
            ) : (
              <form
                action={async () => {
                  "use server";
                  await signIn("discord");
                }}
              >
                <button
                  type="submit"
                  className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-medium hover:bg-indigo-500"
                >
                  Sign in with Discord
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="rounded px-2.5 py-1 text-zinc-300 hover:bg-zinc-900 hover:text-[#ff6b35] transition-colors"
    >
      {children}
    </Link>
  );
}
