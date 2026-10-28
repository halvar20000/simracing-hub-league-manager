import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import MobileMenu from "@/components/MobileMenu";

export default async function Nav() {
  const session = await auth();

  // session.user.role is already populated by the NextAuth session callback
  // (the database session strategy loads the User row on every request), so
  // there is no need for a separate prisma.user lookup here.
  const role =
    (session?.user as { role?: string } | undefined)?.role ?? null;

  let pendingReports = 0;
  if (role === "ADMIN" || role === "STEWARD") {
    pendingReports = await prisma.incidentReport.count({
      where: { status: "SUBMITTED" },
    });
  }
  const isFullAdmin = role === "ADMIN";
  const isSteward = role === "ADMIN" || role === "STEWARD";

  const links: { href: string; label: React.ReactNode }[] = [
    { href: "/leagues", label: "Leagues" },
    { href: "/calendar", label: "Calendar" },
    { href: "/rosters", label: "Rosters" },
    { href: "/teams", label: "Teams" },
    { href: "/incidents", label: "Incidents" },
    { href: "/streams", label: "Streams" },
    { href: "/stint-planner", label: "Stint Planner" },
    ...(session?.user
      ? [
          { href: "/teams/statistics", label: "Team Stats" },
          { href: "/registrations", label: "My Registrations" },
          { href: "/reports", label: "My Reports" },
          { href: "/race-logger", label: "Race Logger" },
          { href: "/profile", label: "Profile" },
        ]
      : []),
    ...(isFullAdmin ? [{ href: "/admin", label: "Admin" }] : []),
    ...(isSteward
      ? [
          {
            href: "/admin/stewards",
            label: (
              <>
                Stewards
                {pendingReports > 0 && (
                  <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-orange-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
                    {pendingReports}
                  </span>
                )}
              </>
            ),
          },
        ]
      : []),
    { href: "/app", label: "App" },
  ];

  const authButton = session?.user ? (
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
  );

  return (
    <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-[#0a0a0f]/95 backdrop-blur lg:static">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6 lg:py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <img
            src="/logos/site-logo.png"
            alt="Simracing-Hub"
            className="h-9 w-auto lg:h-12"
          />
        </Link>
        {/* Desktop: one row. */}
        <div className="hidden items-center gap-1 text-sm lg:flex">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
          <div className="ml-2">{authButton}</div>
        </div>
        {/* Phone / tablet: menu button. <details> needs no client JS. */}
        <div className="flex items-center gap-2 lg:hidden">
          {authButton}
          <MobileMenu
            summary={
            <summary
              aria-label="Menu"
              className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded border border-zinc-700 text-zinc-300 [&::-webkit-details-marker]:hidden"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path className="group-open:hidden" d="M4 6h16M4 12h16M4 18h16" />
                <path className="hidden group-open:block" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </summary>
            }
          >
            <div className="absolute right-0 top-11 z-50 max-h-[75vh] w-60 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl shadow-black/60">
              {links.map((l) => (
                <Link
                  key={l.href}
                  href={l.href}
                  className="block rounded px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900 hover:text-[#ff6b35]"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          </MobileMenu>
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
