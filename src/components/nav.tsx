import Link from "next/link";
import { auth, signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";
import MobileMenu from "@/components/MobileMenu";
import { getCasRatingCached } from "@/lib/cas-rating-data";
import { fmtCr } from "@/components/CasRatingCard";

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
  // CAS Rating badge (like the iRacing licence in the top bar). Never let a
  // rating problem break the navigation.
  // Until the CR is switched live (admin page), only admins see the badge.
  let myCr: number | null = null;
  if (session?.user?.id) {
    try {
      const { engine, config } = await getCasRatingCached(prisma);
      if (config.live || role === "ADMIN") myCr = engine.rate(session.user.id).rating;
    } catch {
      myCr = null;
    }
  }
  const crBadge =
    myCr != null ? (
      <Link
        href="/rating"
        title="My CAS Rating"
        className="inline-flex items-baseline gap-1.5 rounded-full border-[1.5px] border-[#ff6b35] px-2.5 py-0.5 hover:bg-[#ff6b35]/10"
      >
        <small className="text-[10px] font-bold tracking-widest text-[#ff6b35]">CR</small>
        <b className="text-sm tabular-nums text-white">{fmtCr(myCr)}</b>
      </Link>
    ) : null;

  const isFullAdmin = role === "ADMIN";
  const isSteward = role === "ADMIN" || role === "STEWARD";

  // Public + staff links stay in the top row; everything that is about the
  // signed-in driver lives in the account menu behind the round avatar on the
  // right, so the row fits even for admins without zooming out.
  const links: { href: string; label: React.ReactNode }[] = [
    { href: "/leagues", label: "Leagues" },
    { href: "/calendar", label: "Calendar" },
    { href: "/rosters", label: "Rosters" },
    { href: "/teams", label: "Teams" },
    { href: "/incidents", label: "Incidents" },
    { href: "/streams", label: "Streams" },
    { href: "/stint-planner", label: "Stint Planner" },
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
  const accountLinks: { href: string; label: React.ReactNode }[] = session?.user
    ? [
        { href: "/profile", label: "Profile" },
        ...(myCr != null ? [{ href: "/rating", label: "My CAS Rating" }] : []),
        { href: "/registrations", label: "My Registrations" },
        { href: "/reports", label: "My Reports" },
        { href: "/teams/statistics", label: "Team Stats" },
        { href: "/race-logger", label: "Race Logger" },
      ]
    : [];
  const userLabel = session?.user?.name ?? "Account";
  const userImage = session?.user?.image ?? null;
  const userInitial = (userLabel.replace(/\[[^\]]*\]/g, "").trim()[0] ?? "?").toUpperCase();

  const signOutForm = (
    <form
      action={async () => {
        "use server";
        await signOut();
      }}
    >
      <button
        type="submit"
        className="block w-full rounded px-3 py-2.5 text-left text-sm text-zinc-400 hover:bg-zinc-900 hover:text-red-400"
      >
        Sign out
      </button>
    </form>
  );
  const menuLink = "block rounded px-3 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900 hover:text-[#ff6b35]";
  const authButton = (
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
    <nav className="sticky top-0 z-40 border-b border-zinc-800 bg-[#0a0a0f]/95 backdrop-blur xl:static">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 sm:px-6 xl:py-2.5">
        <Link href="/" className="flex shrink-0 items-center gap-3">
          <img
            src="/logos/site-logo.png"
            alt="Simracing-Hub"
            className="h-9 w-auto xl:h-11"
          />
        </Link>
        {/* Desktop: one row + account menu. */}
        <div className="ml-6 hidden min-w-0 flex-1 items-center gap-0.5 whitespace-nowrap text-sm xl:flex">
          {links.map((l) => (
            <NavLink key={l.href} href={l.href}>
              {l.label}
            </NavLink>
          ))}
          <div className="ml-auto" />
          {crBadge && <div className="ml-3">{crBadge}</div>}
          <div className="ml-2">
            {session?.user ? (
              <MobileMenu
                summary={
                  <summary
                    aria-label="Account menu"
                    title={userLabel}
                    className="flex h-10 w-10 cursor-pointer list-none items-center justify-center overflow-hidden rounded-full border-2 border-zinc-600 bg-indigo-700 text-sm font-bold text-white hover:border-[#ff6b35] group-open:border-[#ff6b35] [&::-webkit-details-marker]:hidden"
                  >
                    {userImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={userImage} alt="" className="h-full w-full object-cover" />
                    ) : (
                      userInitial
                    )}
                  </summary>
                }
              >
                <div className="absolute right-0 top-12 z-50 w-60 rounded-lg border border-zinc-800 bg-zinc-950 p-1.5 shadow-xl shadow-black/60">
                  <div className="truncate px-3 py-2 text-xs text-zinc-500">{userLabel}</div>
                  {accountLinks.map((l) => (
                    <Link key={l.href} href={l.href} className={menuLink}>
                      {l.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-zinc-800" />
                  {signOutForm}
                </div>
              </MobileMenu>
            ) : (
              authButton
            )}
          </div>
        </div>
        {/* Phone / tablet: menu button. <details> needs no client JS. */}
        <div className="flex items-center gap-2 xl:hidden">
          {crBadge}
          {!session?.user && authButton}
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
                <Link key={l.href} href={l.href} className={menuLink}>
                  {l.label}
                </Link>
              ))}
              {session?.user && (
                <>
                  <div className="my-1 border-t border-zinc-800" />
                  <div className="truncate px-3 py-1.5 text-xs text-zinc-500">{userLabel}</div>
                  {accountLinks.map((l) => (
                    <Link key={l.href} href={l.href} className={menuLink}>
                      {l.label}
                    </Link>
                  ))}
                  <div className="my-1 border-t border-zinc-800" />
                  {signOutForm}
                </>
              )}
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
      className="rounded px-2 py-1 text-zinc-300 hover:bg-zinc-900 hover:text-[#ff6b35] transition-colors"
    >
      {children}
    </Link>
  );
}
