#!/usr/bin/env bash
# Week 2 Phase 2 — Admin layout + League/Season/Round CRUD + public views
# Adds the admin UI with auth gating, server actions for mutations,
# and public-facing league/season pages.
#
# Usage:
#   bash week2-phase2-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "ERROR: Project not found at $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR"

echo "============================================="
echo "Week 2 Phase 2 — Admin UI + League CRUD"
echo "============================================="
echo ""

# ------------------------------------------------------------
# Helper: ensure a directory exists
# ------------------------------------------------------------
ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Auth helpers — requireAuth(), requireAdmin()
# ------------------------------------------------------------
echo ">>> Writing auth helpers..."
ensure_dir src/lib

cat > src/lib/auth-helpers.ts <<'EOF'
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }
  return session.user;
}

export async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin");
  }

  // Re-fetch from DB so we always have the current role
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
  });

  if (!user || user.role !== "ADMIN") {
    redirect("/");
  }

  return user;
}
EOF

# ------------------------------------------------------------
# 2. Slug helper
# ------------------------------------------------------------
echo ">>> Writing slug helper..."

cat > src/lib/slug.ts <<'EOF'
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
EOF

# ------------------------------------------------------------
# 3. Server actions — leagues
# ------------------------------------------------------------
echo ">>> Writing server actions for leagues, seasons, rounds..."
ensure_dir src/lib/actions

cat > src/lib/actions/leagues.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/slug";

export async function createLeague(formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect("/admin/leagues/new?error=Name+is+required");
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.league.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  await prisma.league.create({
    data: { name, slug, description, createdById: admin.id },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${slug}`);
}

export async function updateLeague(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect(`/admin/leagues/${id}/edit?error=Name+is+required`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: { name, description },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${updated.slug}`);
}

export async function deleteLeague(id: string) {
  await requireAdmin();
  await prisma.league.delete({ where: { id } });
  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect("/admin/leagues");
}
EOF

cat > src/lib/actions/seasons.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { SeasonStatus, TeamScoringMode } from "@prisma/client";

export async function createSeason(leagueSlug: string, formData: FormData) {
  await requireAdmin();

  const league = await prisma.league.findUnique({
    where: { slug: leagueSlug },
  });
  if (!league) redirect("/admin/leagues");

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  const scoringSystemId = String(formData.get("scoringSystemId") ?? "");
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  if (!name || !year || !scoringSystemId) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/new?error=Name%2C+year+and+scoring+system+are+required`
    );
  }

  const created = await prisma.season.create({
    data: {
      leagueId: league.id,
      name,
      year,
      scoringSystemId,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${created.id}`);
}

export async function updateSeason(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const year = parseInt(String(formData.get("year") ?? "0"), 10);
  const scoringSystemId = String(formData.get("scoringSystemId") ?? "");
  const status = String(formData.get("status") ?? "DRAFT") as SeasonStatus;
  const isMulticlass = formData.get("isMulticlass") === "on";
  const proAmEnabled = formData.get("proAmEnabled") === "on";
  const teamScoringMode = String(
    formData.get("teamScoringMode") ?? "NONE"
  ) as TeamScoringMode;
  const teamScoringBestNRaw = String(formData.get("teamScoringBestN") ?? "");
  const teamScoringBestN =
    teamScoringMode === "SUM_BEST_N" && teamScoringBestNRaw
      ? parseInt(teamScoringBestNRaw, 10)
      : null;

  await prisma.season.update({
    where: { id: seasonId },
    data: {
      name,
      year,
      scoringSystemId,
      status,
      isMulticlass,
      proAmEnabled,
      teamScoringMode,
      teamScoringBestN,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteSeason(leagueSlug: string, seasonId: string) {
  await requireAdmin();
  await prisma.season.delete({ where: { id: seasonId } });
  revalidatePath(`/admin/leagues/${leagueSlug}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}`);
}
EOF

cat > src/lib/actions/rounds.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { RoundStatus } from "@prisma/client";

export async function createRound(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;

  if (!name || !track || !startsAtRaw) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/new?error=Name%2C+track+and+start+time+are+required`
    );
  }

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  // Auto-assign next round number
  const lastRound = await prisma.round.findFirst({
    where: { seasonId },
    orderBy: { roundNumber: "desc" },
    select: { roundNumber: true },
  });
  const roundNumber = (lastRound?.roundNumber ?? 0) + 1;

  await prisma.round.create({
    data: {
      seasonId,
      roundNumber,
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function updateRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const track = String(formData.get("track") ?? "").trim();
  const trackConfig = String(formData.get("trackConfig") ?? "").trim() || null;
  const startsAtRaw = String(formData.get("startsAt") ?? "");
  const raceLengthRaw = String(formData.get("raceLengthMinutes") ?? "");
  const countsForChampionship = formData.get("countsForChampionship") !== null;
  const status = String(formData.get("status") ?? "UPCOMING") as RoundStatus;

  const startsAt = new Date(startsAtRaw);
  const raceLengthMinutes = raceLengthRaw
    ? parseInt(raceLengthRaw, 10)
    : null;

  await prisma.round.update({
    where: { id: roundId },
    data: {
      name,
      track,
      trackConfig,
      startsAt,
      raceLengthMinutes,
      countsForChampionship,
      status,
    },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/leagues/${leagueSlug}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}

export async function deleteRound(
  leagueSlug: string,
  seasonId: string,
  roundId: string
) {
  await requireAdmin();
  await prisma.round.delete({ where: { id: roundId } });
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
}
EOF

# ------------------------------------------------------------
# 4. Update nav with admin/leagues links
# ------------------------------------------------------------
echo ">>> Updating nav with admin/leagues links..."

cat > src/components/nav.tsx <<'EOF'
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
EOF

# ------------------------------------------------------------
# 5. Admin layout (auth-gated)
# ------------------------------------------------------------
echo ">>> Writing admin layout..."
ensure_dir src/app/admin

cat > src/app/admin/layout.tsx <<'EOF'
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Admin
        </h2>
        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/leagues"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Leagues
        </Link>
      </aside>
      <div>{children}</div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 6. Admin dashboard
# ------------------------------------------------------------
echo ">>> Writing admin dashboard..."

cat > src/app/admin/page.tsx <<'EOF'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminDashboard() {
  const [leagueCount, seasonCount, roundCount, userCount, scoringCount] =
    await Promise.all([
      prisma.league.count(),
      prisma.season.count(),
      prisma.round.count(),
      prisma.user.count(),
      prisma.scoringSystem.count(),
    ]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Stat label="Leagues" value={leagueCount} />
        <Stat label="Seasons" value={seasonCount} />
        <Stat label="Rounds" value={roundCount} />
        <Stat label="Users" value={userCount} />
        <Stat label="Scoring systems" value={scoringCount} />
      </div>

      <section className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <h2 className="text-lg font-semibold">Quick links</h2>
        <ul className="mt-3 space-y-2 text-sm">
          <li>
            <Link
              href="/admin/leagues"
              className="text-orange-400 hover:underline"
            >
              Manage leagues and seasons →
            </Link>
          </li>
          <li>
            <Link
              href="/admin/leagues/new"
              className="text-orange-400 hover:underline"
            >
              Create a new league →
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 7. League list + create + detail + edit
# ------------------------------------------------------------
echo ">>> Writing admin league pages..."
ensure_dir src/app/admin/leagues
ensure_dir src/app/admin/leagues/new
ensure_dir 'src/app/admin/leagues/[slug]'
ensure_dir 'src/app/admin/leagues/[slug]/edit'

cat > src/app/admin/leagues/page.tsx <<'EOF'
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function AdminLeaguesList() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { seasons: true } } },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Leagues</h1>
        <Link
          href="/admin/leagues/new"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          + New League
        </Link>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Seasons</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {leagues.map((league) => (
              <tr
                key={league.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3 font-medium">{league.name}</td>
                <td className="px-4 py-3 text-zinc-500">{league.slug}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {league._count.seasons}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leagues/${league.slug}`}
                    className="text-orange-400 hover:underline"
                  >
                    Manage →
                  </Link>
                </td>
              </tr>
            ))}
            {leagues.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No leagues yet. Create the first one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
EOF

cat > src/app/admin/leagues/new/page.tsx <<'EOF'
import Link from "next/link";
import { createLeague } from "@/lib/actions/leagues";

export default async function NewLeaguePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to leagues
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New League</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={createLeague} className="max-w-xl space-y-4">
        <Field label="Name" name="name" required placeholder="CAS Combined Cup" />
        <Field
          label="Description"
          name="description"
          textarea
          placeholder="Optional description shown on the public league page"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create League
          </button>
          <Link
            href="/admin/leagues"
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  textarea,
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  textarea?: boolean;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      {textarea ? (
        <textarea
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          rows={4}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        />
      ) : (
        <input
          name={name}
          required={required}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
        />
      )}
    </label>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminLeagueDetail({
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
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← All leagues
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{league.name}</h1>
          <Link
            href={`/admin/leagues/${league.slug}/edit`}
            className="text-sm text-orange-400 hover:underline"
          >
            Edit league
          </Link>
        </div>
        {league.description && (
          <p className="mt-2 text-sm text-zinc-400">{league.description}</p>
        )}
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Seasons</h2>
          <Link
            href={`/admin/leagues/${league.slug}/seasons/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + New Season
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Year</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Scoring</th>
                <th className="px-4 py-3">Rounds</th>
                <th className="px-4 py-3">Drivers</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {league.seasons.map((s) => (
                <tr
                  key={s.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{s.year}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s.scoringSystem.name}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s._count.rounds}
                  </td>
                  <td className="px-4 py-3 text-zinc-400">
                    {s._count.registrations}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leagues/${league.slug}/seasons/${s.id}`}
                      className="text-orange-400 hover:underline"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              ))}
              {league.seasons.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No seasons yet. Create the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    DRAFT: "bg-zinc-800 text-zinc-400",
    OPEN_REGISTRATION: "bg-blue-900 text-blue-200",
    ACTIVE: "bg-emerald-900 text-emerald-200",
    COMPLETED: "bg-zinc-900 text-zinc-500",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${colors[status] ?? ""}`}
    >
      {status.replace("_", " ")}
    </span>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateLeague } from "@/lib/actions/leagues";

export default async function EditLeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) notFound();

  const update = updateLeague.bind(null, league.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${league.slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit League</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Name</span>
          <input
            name="name"
            required
            defaultValue={league.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Description</span>
          <textarea
            name="description"
            defaultValue={league.description ?? ""}
            rows={4}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${league.slug}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 8. Season pages
# ------------------------------------------------------------
echo ">>> Writing admin season pages..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/new'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/edit'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/new'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit'

cat > 'src/app/admin/leagues/[slug]/seasons/new/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSeason } from "@/lib/actions/seasons";

export default async function NewSeasonPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug } = await params;
  const { error } = await searchParams;

  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) notFound();

  const scoringSystems = await prisma.scoringSystem.findMany({
    orderBy: { name: "asc" },
  });

  const create = createSeason.bind(null, slug);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Season</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Season name</span>
          <input
            name="name"
            required
            placeholder="2026 Spring"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Year</span>
          <input
            name="year"
            type="number"
            required
            defaultValue={2026}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            name="scoringSystemId"
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="">Select scoring system…</option>
            {scoringSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="isMulticlass" />
          Multiclass season
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input type="checkbox" name="proAmEnabled" />
          Pro/Am split enabled
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team scoring mode
          </span>
          <select
            name="teamScoringMode"
            defaultValue="SUM_BEST_N"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="NONE">None (no team standings)</option>
            <option value="SUM_ALL">Sum all drivers</option>
            <option value="SUM_BEST_N">Sum best N drivers per race</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Best-N value (only used with SUM_BEST_N)
          </span>
          <input
            name="teamScoringBestN"
            type="number"
            defaultValue={2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create Season
          </button>
          <Link
            href={`/admin/leagues/${slug}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function AdminSeasonDetail({
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
      rounds: { orderBy: { roundNumber: "asc" } },
      _count: { select: { registrations: true } },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.league.name}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">{season.name}</h1>
            <p className="text-sm text-zinc-400">
              {season.year} • {season.scoringSystem.name} •{" "}
              {season.status.replace("_", " ")}
            </p>
          </div>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/edit`}
            className="text-sm text-orange-400 hover:underline"
          >
            Edit season
          </Link>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <Stat label="Rounds" value={season.rounds.length} />
        <Stat label="Drivers" value={season._count.registrations} />
        <Stat
          label="Multiclass"
          value={season.isMulticlass ? "Yes" : "No"}
        />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Race calendar</h2>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + Add Round
          </Link>
        </div>

        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rd</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr
                  key={r.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900"
                >
                  <td className="px-4 py-3 text-zinc-500">{r.roundNumber}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
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
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${r.id}/edit`}
                      className="text-orange-400 hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-zinc-500"
                  >
                    No rounds yet. Add the first one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm text-zinc-400">{label}</div>
    </div>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateSeason } from "@/lib/actions/seasons";

export default async function EditSeasonPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;

  const [season, scoringSystems] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: { league: true },
    }),
    prisma.scoringSystem.findMany({ orderBy: { name: "asc" } }),
  ]);

  if (!season || season.league.slug !== slug) notFound();

  const update = updateSeason.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Season</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Season name</span>
          <input
            name="name"
            required
            defaultValue={season.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Year</span>
          <input
            name="year"
            type="number"
            required
            defaultValue={season.year}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={season.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="DRAFT">Draft</option>
            <option value="OPEN_REGISTRATION">Open registration</option>
            <option value="ACTIVE">Active</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Scoring system
          </span>
          <select
            name="scoringSystemId"
            defaultValue={season.scoringSystemId}
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            {scoringSystems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="isMulticlass"
            defaultChecked={season.isMulticlass}
          />
          Multiclass season
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="proAmEnabled"
            defaultChecked={season.proAmEnabled}
          />
          Pro/Am split enabled
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Team scoring mode
          </span>
          <select
            name="teamScoringMode"
            defaultValue={season.teamScoringMode}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          >
            <option value="NONE">None</option>
            <option value="SUM_ALL">Sum all drivers</option>
            <option value="SUM_BEST_N">Sum best N drivers per race</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Best-N value
          </span>
          <input
            name="teamScoringBestN"
            type="number"
            defaultValue={season.teamScoringBestN ?? 2}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 9. Round pages
# ------------------------------------------------------------
echo ">>> Writing admin round pages..."

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/new/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createRound } from "@/lib/actions/rounds";

export default async function NewRoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId } = await params;
  const { error } = await searchParams;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const create = createRound.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Add Round</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Round name</span>
          <input
            name="name"
            required
            placeholder="Round 1 — Spa-Francorchamps"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Track</span>
          <input
            name="track"
            required
            placeholder="Spa-Francorchamps"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Track config (optional)
          </span>
          <input
            name="trackConfig"
            placeholder="Grand Prix"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Start date and time</span>
          <input
            name="startsAt"
            type="datetime-local"
            required
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Race length in minutes (optional)
          </span>
          <input
            name="raceLengthMinutes"
            type="number"
            placeholder="60"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="countsForChampionship"
            defaultChecked
          />
          Counts for championship points
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Add Round
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateRound } from "@/lib/actions/rounds";

function toLocalDateTime(d: Date) {
  // Format as YYYY-MM-DDTHH:MM for datetime-local input
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default async function EditRoundPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}) {
  const { slug, seasonId, roundId } = await params;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });

  if (!round || round.seasonId !== seasonId || round.season.league.slug !== slug) {
    notFound();
  }

  const update = updateRound.bind(null, slug, seasonId, roundId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {round.season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Round</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Round name</span>
          <input
            name="name"
            required
            defaultValue={round.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Track</span>
          <input
            name="track"
            required
            defaultValue={round.track}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Track config</span>
          <input
            name="trackConfig"
            defaultValue={round.trackConfig ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Start date and time</span>
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toLocalDateTime(round.startsAt)}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Race length in minutes
          </span>
          <input
            name="raceLengthMinutes"
            type="number"
            defaultValue={round.raceLengthMinutes ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={round.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="UPCOMING">Upcoming</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-zinc-300">
          <input
            type="checkbox"
            name="countsForChampionship"
            defaultChecked={round.countsForChampionship}
          />
          Counts for championship points
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 10. Public league + season views
# ------------------------------------------------------------
echo ">>> Writing public league + season pages..."
ensure_dir src/app/leagues
ensure_dir 'src/app/leagues/[slug]'
ensure_dir 'src/app/leagues/[slug]/seasons/[seasonId]'

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
      <h1 className="text-3xl font-bold">Leagues</h1>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {leagues.map((league) => {
          const activeSeason = league.seasons[0];
          return (
            <Link
              key={league.id}
              href={`/leagues/${league.slug}`}
              className="block rounded border border-zinc-800 bg-zinc-900 p-5 hover:border-orange-500 hover:bg-zinc-800"
            >
              <h2 className="text-lg font-semibold">{league.name}</h2>
              {league.description && (
                <p className="mt-1 text-sm text-zinc-400">
                  {league.description}
                </p>
              )}
              <p className="mt-3 text-xs text-zinc-500">
                {league._count.seasons} season
                {league._count.seasons === 1 ? "" : "s"}
                {activeSeason && (
                  <span className="ml-2 rounded bg-emerald-950 px-2 py-0.5 text-emerald-300">
                    {activeSeason.name} {activeSeason.year}
                  </span>
                )}
              </p>
            </Link>
          );
        })}
        {leagues.length === 0 && (
          <p className="text-zinc-500">No leagues yet.</p>
        )}
      </div>
    </div>
  );
}
EOF

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
    <div className="space-y-6">
      <div>
        <Link
          href="/leagues"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← All leagues
        </Link>
        <h1 className="mt-2 text-3xl font-bold">{league.name}</h1>
        {league.description && (
          <p className="mt-2 text-zinc-400">{league.description}</p>
        )}
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seasons</h2>
        <div className="grid gap-3 md:grid-cols-2">
          {league.seasons.map((s) => (
            <Link
              key={s.id}
              href={`/leagues/${league.slug}/seasons/${s.id}`}
              className="block rounded border border-zinc-800 bg-zinc-900 p-4 hover:border-orange-500"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {s.name} {s.year}
                </h3>
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
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
      rounds: { orderBy: { roundNumber: "asc" } },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name}
        </Link>
        <h1 className="mt-2 text-3xl font-bold">
          {season.name} {season.year}
        </h1>
        <p className="mt-1 text-sm text-zinc-400">
          {season.scoringSystem.name} • {season.status.replace("_", " ")}
          {season.isMulticlass && " • Multiclass"}
          {season.proAmEnabled && " • Pro/Am"}
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Race calendar</h2>
        <div className="overflow-hidden rounded border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-4 py-3">Rd</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Track</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {season.rounds.map((r) => (
                <tr key={r.id} className="border-t border-zinc-800">
                  <td className="px-4 py-3 text-zinc-500">{r.roundNumber}</td>
                  <td className="px-4 py-3 font-medium">{r.name}</td>
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
                </tr>
              ))}
              {season.rounds.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-zinc-500">
                    No rounds scheduled yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "Phase 2.2 files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo "   Visit http://localhost:3000"
echo "   You should see: Leagues link in nav, Admin link in nav"
echo "   Click Leagues — see all 6 CAS leagues"
echo "   Click Admin — see the dashboard, then Leagues, then create a season"
echo ""
echo "2. Once it works locally, commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 2 Phase 2: admin UI + league/season/round CRUD + public views'"
echo "   git push"
echo ""
echo "3. Wait for Vercel to redeploy, then test on https://league.simracing-hub.com"
echo ""
