#!/usr/bin/env bash
# Apply the simracing-hub design system to the league manager:
#   - Copy logos into public/logos
#   - Add Rajdhani font for headings (motorsport feel)
#   - Add CSS theme variables matching simracing-hub.com
#   - Refresh nav with site logo
#   - New hero on home page with CAS Community logo
#   - League logos on the leagues list, league detail, season header
#   - Footer with "Powered by Simracing-Hub"
#   - Database script to set each league's logoUrl
#
# Usage:
#   bash design-overhaul.sh
#   then:
#   npx tsx scripts/set-league-logos.ts

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
LOGOS_SRC="$PROJECT_DIR/logos"
LOGOS_DST="$PROJECT_DIR/public/logos"

[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
[ ! -d "$LOGOS_SRC" ] && { echo "ERROR: logos folder not found at $LOGOS_SRC"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Design overhaul — simracing-hub theme + logos"
echo "============================================="

# ------------------------------------------------------------
# 1. Copy logos with cleaner filenames into public/logos
# ------------------------------------------------------------
echo ">>> Copying logos to public/logos..."
mkdir -p "$LOGOS_DST"

cp "$LOGOS_SRC/simracing-hub_logo.svg" "$LOGOS_DST/site-logo.svg"
cp "$LOGOS_SRC/CAS iRacing_community_logo.webp" "$LOGOS_DST/cas-community.webp"
cp "$LOGOS_SRC/GT3_WCT Logo-gelb-frei.webp" "$LOGOS_DST/cas-gt3-wct.webp"
cp "$LOGOS_SRC/IEC-Logo-2026.webp" "$LOGOS_DST/cas-iec.webp"
cp "$LOGOS_SRC/CC-Cup-2026_V2-weiss.webp" "$LOGOS_DST/cas-combined-cup.webp"
cp "$LOGOS_SRC/CSFL_NEU_white_yellow.webp" "$LOGOS_DST/cas-sfl-cup.webp"
cp "$LOGOS_SRC/Porsche_911_GT3_Community_Cup_Logo_-_White_2.webp" "$LOGOS_DST/cas-pccd.webp"
cp "$LOGOS_SRC/TSS_GT4_Masters_Logo_Design_-_White_2-NEU.webp" "$LOGOS_DST/cas-tss-gt4.webp"

ls -1 "$LOGOS_DST"

# ------------------------------------------------------------
# 2. Update globals.css with simracing-hub theme variables
# ------------------------------------------------------------
echo ">>> Writing globals.css..."

cat > src/app/globals.css <<'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #0a0a0f;
  --bg-secondary: #14141c;
  --bg-card: #1a1a24;
  --border-subtle: #2a2a36;
  --text-primary: #f4f4f5;
  --text-secondary: #a1a1aa;
  --text-muted: #71717a;
  --accent-red: #e63946;
  --accent-orange: #ff6b35;
  --accent-yellow: #ffd60a;
}

html,
body {
  background: var(--bg-primary);
  color: var(--text-primary);
}

.font-display {
  font-family: var(--font-rajdhani), system-ui, sans-serif;
  letter-spacing: -0.01em;
}

.tag {
  display: inline-block;
  padding: 0.125rem 0.625rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.tag-orange { background: rgba(255, 107, 53, 0.15); color: var(--accent-orange); }
.tag-red    { background: rgba(230, 57, 70, 0.15); color: var(--accent-red); }
.tag-yellow { background: rgba(255, 214, 10, 0.15); color: var(--accent-yellow); }
.tag-zinc   { background: rgba(160, 160, 170, 0.12); color: var(--text-secondary); }
EOF

# ------------------------------------------------------------
# 3. layout.tsx — load Inter + Rajdhani fonts
# ------------------------------------------------------------
echo ">>> Updating root layout (fonts + theme)..."

cat > src/app/layout.tsx <<'EOF'
import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import Nav from "@/components/nav";
import Footer from "@/components/footer";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const rajdhani = Rajdhani({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-rajdhani",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Simracing-Hub League Manager — CAS iRacing Community",
  description:
    "League management for the CAS iRacing community. Six championships, live standings, Fair Play Rating, race-by-race results.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.variable} ${rajdhani.variable} font-sans min-h-screen flex flex-col`}
        style={{ fontFamily: "var(--font-inter), system-ui, sans-serif" }}
      >
        <Nav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
          {children}
        </main>
        <Footer />
      </body>
    </html>
  );
}
EOF

# ------------------------------------------------------------
# 4. Nav with site logo
# ------------------------------------------------------------
echo ">>> Writing nav..."

cat > src/components/nav.tsx <<'EOF'
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
    isAdmin = user?.role === "ADMIN";
  }

  return (
    <nav className="border-b border-zinc-800 bg-[#0a0a0f]/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex items-center gap-3 group">
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-9 w-9"
          />
          <div className="leading-tight">
            <div className="font-display text-base font-bold tracking-wide group-hover:text-[#ff6b35] transition-colors">
              SIMRACING-HUB
            </div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
              League Manager
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-1 text-sm">
          <NavLink href="/leagues">Leagues</NavLink>
          {session?.user && (
            <>
              <NavLink href="/registrations">My Registrations</NavLink>
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
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800"
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
                  className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium hover:bg-indigo-500"
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
      className="rounded px-3 py-1.5 text-zinc-300 hover:bg-zinc-900 hover:text-[#ff6b35] transition-colors"
    >
      {children}
    </Link>
  );
}
EOF

# ------------------------------------------------------------
# 5. Footer
# ------------------------------------------------------------
echo ">>> Writing footer..."

cat > src/components/footer.tsx <<'EOF'
import Link from "next/link";

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-800 bg-[#0a0a0f]">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-6 w-6 opacity-70"
          />
          <span>
            Powered by{" "}
            <Link
              href="https://simracing-hub.com"
              className="text-zinc-300 hover:text-[#ff6b35]"
              target="_blank"
              rel="noopener noreferrer"
            >
              Simracing-Hub
            </Link>
          </span>
        </div>
        <p className="text-xs text-zinc-500">
          Independent. No ads. No tracking. No affiliate links.
        </p>
      </div>
    </footer>
  );
}
EOF

# ------------------------------------------------------------
# 6. Home page with hero
# ------------------------------------------------------------
echo ">>> Writing new home page..."

cat > src/app/page.tsx <<'EOF'
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
EOF

# ------------------------------------------------------------
# 7. Public leagues list
# ------------------------------------------------------------
echo ">>> Writing /leagues with logo cards..."

cat > src/app/leagues/page.tsx <<'EOF'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function PublicLeaguesList() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { seasons: true } },
      seasons: {
        where: { status: { in: ["OPEN_REGISTRATION", "ACTIVE"] } },
        orderBy: { year: "desc" },
        take: 1,
      },
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <span className="tag tag-orange">CAS Community</span>
        <h1 className="mt-2 font-display text-3xl font-bold">Leagues</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {leagues.length} championship
          {leagues.length === 1 ? "" : "s"} run by the CAS iRacing community.
        </p>
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
                {league.description && (
                  <p className="mt-1 text-xs text-zinc-500">
                    {league.description}
                  </p>
                )}
                <div className="mt-3 flex items-center justify-between text-xs">
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
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 8. League detail (with prominent logo header)
# ------------------------------------------------------------
echo ">>> Writing /leagues/[slug] with logo header..."

cat > 'src/app/leagues/[slug]/page.tsx' <<'EOF'
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
EOF

# ------------------------------------------------------------
# 9. Season detail with small league logo header
# ------------------------------------------------------------
echo ">>> Writing season detail header with league logo..."

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function PublicSeasonDetail({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: true,
      scoringSystem: true,
      rounds: {
        orderBy: { roundNumber: "asc" },
        include: { _count: { select: { raceResults: true } } },
      },
      registrations: {
        where: { status: "APPROVED" },
        include: { user: true, team: true, carClass: true },
        orderBy: [{ startNumber: "asc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const registrationOpen =
    season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE";
  const hasResults = season.rounds.some((r) => r._count.raceResults > 0);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name}
        </Link>
        <div className="mt-3 flex flex-col gap-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            {season.league.logoUrl && (
              <img
                src={season.league.logoUrl}
                alt={season.league.name}
                className="h-16 w-16 object-contain"
              />
            )}
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight sm:text-3xl">
                {season.name} {season.year}
              </h1>
              <p className="mt-1 text-sm text-zinc-400">
                {season.scoringSystem.name} • {season.status.replace("_", " ")}
                {season.isMulticlass && " • Multiclass"}
                {season.proAmEnabled && " • Pro/Am"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasResults && (
              <Link
                href={`/leagues/${slug}/seasons/${seasonId}/standings`}
                className="rounded border border-[#ff6b35] px-4 py-2 text-sm font-medium text-[#ff6b35] hover:bg-[#ff6b35]/10"
              >
                Standings →
              </Link>
            )}
            {registrationOpen && (
              <Link
                href={`/leagues/${slug}/seasons/${seasonId}/register`}
                className="rounded bg-[#ff6b35] px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-[#ff8550]"
              >
                Register for this season →
              </Link>
            )}
          </div>
        </div>
      </div>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">Race calendar</h2>
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3 font-display tracking-wider">Rd</th>
                <th className="px-4 py-3 font-display tracking-wider">Name</th>
                <th className="px-4 py-3 font-display tracking-wider">Track</th>
                <th className="px-4 py-3 font-display tracking-wider">Date</th>
                <th className="px-4 py-3 font-display tracking-wider">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 font-display text-zinc-500">
                    {r.roundNumber}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    <Link
                      href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                      className="hover:text-[#ff6b35]"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.track}
                    {r.trackConfig ? ` (${r.trackConfig})` : ""}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {new Date(r.startsAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {r.status.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-500">
                    {r._count.raceResults > 0 ? (
                      <Link
                        href={`/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}`}
                        className="text-[#ff6b35] hover:underline"
                      >
                        Results →
                      </Link>
                    ) : (
                      <span className="text-xs">No results</span>
                    )}
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No rounds scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 font-display text-lg font-bold">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">No approved drivers yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3 font-display tracking-wider">#</th>
                  <th className="px-4 py-3 font-display tracking-wider">Driver</th>
                  <th className="px-4 py-3 font-display tracking-wider">Team</th>
                  {season.isMulticlass && (
                    <th className="px-4 py-3 font-display tracking-wider">Class</th>
                  )}
                  {season.proAmEnabled && (
                    <th className="px-4 py-3 font-display tracking-wider">Pro/Am</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {season.registrations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 font-display text-zinc-500">
                      {r.startNumber ?? "—"}
                    </td>
                    <td className="px-4 py-3 font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </td>
                    <td className="px-4 py-3 text-zinc-400">
                      {r.team?.name ?? "—"}
                    </td>
                    {season.isMulticlass && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.carClass?.name ?? "—"}
                      </td>
                    )}
                    {season.proAmEnabled && (
                      <td className="px-4 py-3 text-zinc-400">
                        {r.proAmClass ?? "—"}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 10. DB script to set logoUrl on each league
# ------------------------------------------------------------
echo ">>> Writing scripts/set-league-logos.ts..."

mkdir -p scripts
cat > scripts/set-league-logos.ts <<'EOF'
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const logoMap: Record<string, string> = {
  "cas-gt3-wct":      "/logos/cas-gt3-wct.webp",
  "cas-iec":          "/logos/cas-iec.webp",
  "cas-combined-cup": "/logos/cas-combined-cup.webp",
  "cas-sfl-cup":      "/logos/cas-sfl-cup.webp",
  "cas-pccd":         "/logos/cas-pccd.webp",
  "cas-tss-gt4":      "/logos/cas-tss-gt4.webp",
};

async function main() {
  for (const [slug, url] of Object.entries(logoMap)) {
    const result = await prisma.league.updateMany({
      where: { slug },
      data: { logoUrl: url },
    });
    console.log(
      `  ${slug.padEnd(20)} → ${url}  ${result.count > 0 ? "✓" : "(no row matched)"}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
EOF

echo ""
echo "============================================="
echo "Design overhaul written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Set logos in the database:"
echo "      npx tsx scripts/set-league-logos.ts"
echo ""
echo "2. Restart the dev server to pick up the new fonts:"
echo "      Ctrl-C in npm run dev terminal, then:"
echo "      npm run dev"
echo ""
echo "3. Visit http://localhost:3000 — you should see:"
echo "   - Site logo + Rajdhani-styled SIMRACING-HUB title in nav"
echo "   - Hero with CAS Community logo"
echo "   - Six league cards with their official logos"
echo "   - Footer with 'Powered by Simracing-Hub'"
echo ""
echo "4. Once it looks good, commit + push to deploy:"
echo "      git add -A"
echo "      git commit -m 'Design overhaul: simracing-hub theme + logos'"
echo "      git push"
echo ""
