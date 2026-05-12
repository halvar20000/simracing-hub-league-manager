#!/usr/bin/env bash
# Bump league logos from 15px to 20px, and put "League Manager" tagline
# under the SIMRACING-HUB wordmark in the nav (matching the parent site's
# "daily sim racing news" tagline pattern).

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# Bump 15px sized logos to 20px (h-5)
# h-[15px] w-full   → h-5 w-full
# h-[15px] w-[15px] → h-5 w-5
sed -i '' \
  -e 's|h-\[15px\] w-full|h-5 w-full|g' \
  -e 's|h-\[15px\] w-\[15px\]|h-5 w-5|g' \
  src/app/page.tsx \
  src/app/leagues/page.tsx \
  'src/app/leagues/[slug]/page.tsx' \
  'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx'

# Also fix the placeholder div used when a league has no logoUrl
sed -i '' \
  's|className="h-\[15px\] w-full rounded bg-zinc-800"|className="h-5 w-full rounded bg-zinc-800"|g' \
  src/app/page.tsx \
  src/app/leagues/page.tsx

# Nav — add "League Manager" tagline under SIMRACING-HUB
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-2.5">
        <Link href="/" className="flex items-center gap-2 group">
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-7 w-7"
          />
          <div className="leading-tight">
            <div className="font-display text-sm font-bold tracking-wide group-hover:text-[#ff6b35] transition-colors">
              SIMRACING-HUB
            </div>
            <div className="text-[9px] uppercase tracking-[0.22em] text-zinc-500">
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
                  className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
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
                  className="rounded bg-indigo-600 px-3 py-1 text-xs font-medium hover:bg-indigo-500"
                >
                  Sign in
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
EOF

echo "Done. Logos bumped to 20px, nav now shows 'League Manager' tagline."
