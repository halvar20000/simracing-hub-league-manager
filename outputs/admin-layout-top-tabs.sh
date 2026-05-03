#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. New AdminTabs client component (with active-link styling)
# ============================================================================
echo "=== 1. Create src/components/AdminTabs.tsx ==="
cat > src/components/AdminTabs.tsx <<'TSX'
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminTabs({
  isAdmin,
  pendingReports,
}: {
  isAdmin: boolean;
  pendingReports: number;
}) {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-zinc-800 pb-2">
      <span className="mr-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {isAdmin ? "Admin" : "Steward"}
      </span>
      <Tab href="/admin" active={isActive("/admin")}>
        Dashboard
      </Tab>
      <Tab
        href="/admin/stewards"
        active={isActive("/admin/stewards")}
      >
        Stewards
        {pendingReports > 0 && (
          <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-orange-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
            {pendingReports}
          </span>
        )}
      </Tab>
      {isAdmin && (
        <>
          <Tab href="/admin/users" active={isActive("/admin/users")}>
            Users
          </Tab>
          <Tab href="/admin/teams" active={isActive("/admin/teams")}>
            Teams
          </Tab>
          <Tab
            href="/admin/scoring-systems"
            active={isActive("/admin/scoring-systems")}
          >
            Scoring systems
          </Tab>
        </>
      )}
    </nav>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-t border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-orange-500 font-medium text-orange-300"
          : "border-transparent text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
TSX
echo "  Written."

# ============================================================================
# 2. Replace admin layout: drop the sidebar grid, render AdminTabs on top
# ============================================================================
echo ""
echo "=== 2. Rewrite src/app/admin/layout.tsx ==="
cat > src/app/admin/layout.tsx <<'TSX'
import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import AdminTabs from "@/components/AdminTabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireSteward();
  const isAdmin = me.role === "ADMIN";

  const pendingReports = await prisma.incidentReport.count({
    where: { status: "SUBMITTED" },
  });

  return (
    <div className="space-y-6">
      <AdminTabs isAdmin={isAdmin} pendingReports={pendingReports} />
      <div>{children}</div>
    </div>
  );
}
TSX
echo "  Written."

# ============================================================================
# 3. Roster admin table: overflow-x-auto so wide tables scroll instead of clip
# ============================================================================
echo ""
echo "=== 3. Roster admin: switch overflow-hidden -> overflow-x-auto ==="
ROSTER='src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'
node -e "
const fs = require('fs');
let s = fs.readFileSync('$ROSTER', 'utf8');
const before = s;
s = s.replace(
  /<div className=\"overflow-hidden rounded border border-zinc-800\">/,
  '<div className=\"overflow-x-auto rounded border border-zinc-800\">'
);
if (s === before) {
  console.log('  Roster wrapper already overflow-x-auto (or different structure).');
} else {
  fs.writeFileSync('$ROSTER', s);
  console.log('  Patched.');
}
"

# ============================================================================
# 4. TS check
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Admin: replace left sidebar with horizontal top-tab nav (full-width content)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "What changes:"
echo "  • All admin pages: the left sidebar is gone."
echo "  • Top of every admin page: a horizontal tab strip with the same links"
echo "    (Dashboard, Stewards, Users, Teams, Scoring systems). The active tab"
echo "    is underlined in orange, with the pending-reports badge on Stewards."
echo "  • Content fills the full max-w-6xl width (no more 200px sidebar eating"
echo "    into it). The roster's 12 columns get ~25% more horizontal space."
echo "  • Roster table also got overflow-x-auto so on narrower screens it"
echo "    scrolls within its container instead of getting clipped."
