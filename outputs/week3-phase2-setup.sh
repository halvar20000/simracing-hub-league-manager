#!/usr/bin/env bash
# Week 3 Phase 2 — Teams + Car Classes + per-registration edit form
# Adds full admin management for teams and classes, and a complete
# registration edit form (status, start number, team, class, Pro/Am).
#
# Usage:
#   bash week3-phase2-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Week 3 Phase 2 — Teams, Classes, Reg edit"
echo "============================================="

ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Teams server actions
# ------------------------------------------------------------
echo ">>> Writing teams actions..."

cat > src/lib/actions/teams.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function createTeam(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=Name+is+required`
    );
  }

  const existing = await prisma.team.findUnique({
    where: { seasonId_name: { seasonId, name } },
  });
  if (existing) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/new?error=A+team+with+that+name+already+exists`
    );
  }

  await prisma.team.create({
    data: { seasonId, name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function updateTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortName = String(formData.get("shortName") ?? "").trim() || null;
  const logoUrl = String(formData.get("logoUrl") ?? "").trim() || null;

  if (!name) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams/${teamId}/edit?error=Name+is+required`
    );
  }

  await prisma.team.update({
    where: { id: teamId },
    data: { name, shortName, logoUrl },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}

export async function deleteTeam(
  leagueSlug: string,
  seasonId: string,
  teamId: string
) {
  await requireAdmin();

  // First detach registrations from this team
  await prisma.registration.updateMany({
    where: { teamId },
    data: { teamId: null },
  });

  await prisma.team.delete({ where: { id: teamId } });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
}
EOF

# ------------------------------------------------------------
# 2. Car class server actions
# ------------------------------------------------------------
echo ">>> Writing car class actions..."

cat > src/lib/actions/car-classes.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

export async function createCarClass(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const displayOrderRaw = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(displayOrderRaw, 10) || 0;

  if (!name || !shortCode) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/new?error=Name+and+short+code+are+required`
    );
  }

  const existing = await prisma.carClass.findUnique({
    where: { seasonId_shortCode: { seasonId, shortCode } },
  });
  if (existing) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/new?error=Short+code+already+used+for+this+season`
    );
  }

  await prisma.carClass.create({
    data: { seasonId, name, shortCode, displayOrder },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}

export async function updateCarClass(
  leagueSlug: string,
  seasonId: string,
  classId: string,
  formData: FormData
) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const shortCode = String(formData.get("shortCode") ?? "").trim();
  const displayOrderRaw = String(formData.get("displayOrder") ?? "0");
  const displayOrder = parseInt(displayOrderRaw, 10) || 0;

  if (!name || !shortCode) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes/${classId}/edit?error=Name+and+short+code+are+required`
    );
  }

  await prisma.carClass.update({
    where: { id: classId },
    data: { name, shortCode, displayOrder },
  });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}

export async function deleteCarClass(
  leagueSlug: string,
  seasonId: string,
  classId: string
) {
  await requireAdmin();

  await prisma.registration.updateMany({
    where: { carClassId: classId },
    data: { carClassId: null },
  });

  await prisma.carClass.delete({ where: { id: classId } });

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/classes`);
}
EOF

# ------------------------------------------------------------
# 3. Extend admin-registrations.ts with updateRegistration
# ------------------------------------------------------------
echo ">>> Updating admin-registrations actions with full edit..."

cat > src/lib/actions/admin-registrations.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import type { RegistrationStatus, ProAmClass } from "@prisma/client";

export async function approveRegistration(registrationId: string) {
  const admin = await requireAdmin();

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "APPROVED",
      approvedById: admin.id,
      approvedAt: new Date(),
    },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  revalidatePath(
    `/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}`
  );
}

export async function rejectRegistration(registrationId: string) {
  await requireAdmin();

  const reg = await prisma.registration.update({
    where: { id: registrationId },
    data: {
      status: "REJECTED",
      approvedById: null,
      approvedAt: null,
    },
    include: { season: { include: { league: true } } },
  });

  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
}

export async function updateRegistration(
  leagueSlug: string,
  seasonId: string,
  registrationId: string,
  formData: FormData
) {
  const admin = await requireAdmin();

  const status = String(formData.get("status") ?? "PENDING") as RegistrationStatus;
  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const teamId = String(formData.get("teamId") ?? "").trim() || null;
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const proAmClassRaw = String(formData.get("proAmClass") ?? "").trim();
  const proAmClass: ProAmClass | null =
    proAmClassRaw === "PRO" || proAmClassRaw === "AM"
      ? (proAmClassRaw as ProAmClass)
      : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const baseData = {
    status,
    startNumber,
    teamId,
    carClassId,
    proAmClass,
    notes,
  };

  const data =
    status === "APPROVED"
      ? { ...baseData, approvedById: admin.id, approvedAt: new Date() }
      : { ...baseData, approvedById: null, approvedAt: null };

  await prisma.registration.update({
    where: { id: registrationId },
    data,
  });

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`);
}
EOF

# ------------------------------------------------------------
# 4. Teams: list, new, edit pages
# ------------------------------------------------------------
echo ">>> Writing teams pages..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/new'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/[teamId]/edit'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function TeamsListPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const teams = await prisma.team.findMany({
    where: { seasonId },
    orderBy: { name: "asc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Teams</h1>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/teams/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + New Team
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Short name</th>
              <th className="px-4 py-3">Drivers</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr
                key={t.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3 font-medium">{t.name}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {t.shortName ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {t._count.registrations}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leagues/${slug}/seasons/${seasonId}/teams/${t.id}/edit`}
                    className="text-orange-400 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {teams.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No teams yet. Create the first one.
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

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/new/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createTeam } from "@/lib/actions/teams";

export default async function NewTeamPage({
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

  const create = createTeam.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to teams
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Team</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <Field
          label="Team name"
          name="name"
          required
          placeholder="Project AGM"
        />
        <Field
          label="Short name (optional)"
          name="shortName"
          placeholder="PAGM"
        />
        <Field
          label="Logo URL (optional)"
          name="logoUrl"
          placeholder="https://…"
        />
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create Team
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
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
  required,
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">{label}</span>
      <input
        name={name}
        required={required}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
      />
    </label>
  );
}
EOF

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/teams/[teamId]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateTeam, deleteTeam } from "@/lib/actions/teams";

export default async function EditTeamPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; teamId: string }>;
}) {
  const { slug, seasonId, teamId } = await params;

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { season: { include: { league: true } } },
  });
  if (
    !team ||
    team.seasonId !== seasonId ||
    team.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateTeam.bind(null, slug, seasonId, teamId);
  const remove = deleteTeam.bind(null, slug, seasonId, teamId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to teams
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Team</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Team name</span>
          <input
            name="name"
            required
            defaultValue={team.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Short name</span>
          <input
            name="shortName"
            defaultValue={team.shortName ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Logo URL</span>
          <input
            name="logoUrl"
            defaultValue={team.logoUrl ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>

      <form action={remove} className="border-t border-zinc-800 pt-6">
        <p className="mb-2 text-sm text-zinc-500">
          Deleting a team detaches it from any drivers currently assigned to
          it. Their registrations stay intact, just without a team.
        </p>
        <button
          type="submit"
          className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
        >
          Delete this team
        </button>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 5. Car classes pages
# ------------------------------------------------------------
echo ">>> Writing car class pages..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/new'
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/[classId]/edit'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function ClassesListPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const classes = await prisma.carClass.findMany({
    where: { seasonId },
    orderBy: { displayOrder: "asc" },
    include: { _count: { select: { registrations: true } } },
  });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <div className="mt-2 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Car classes</h1>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes/new`}
            className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            + New Class
          </Link>
        </div>
        {!season.isMulticlass && (
          <div className="mt-2 rounded border border-amber-800 bg-amber-950 p-3 text-xs text-amber-200">
            This season isn&apos;t marked as multiclass. Classes still exist as
            data but won&apos;t be required at registration. Edit the season to
            enable multiclass mode if needed.
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Short code</th>
              <th className="px-4 py-3">Drivers</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {classes.map((c) => (
              <tr
                key={c.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3 text-zinc-500">{c.displayOrder}</td>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3 text-zinc-400">{c.shortCode}</td>
                <td className="px-4 py-3 text-zinc-400">
                  {c._count.registrations}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/leagues/${slug}/seasons/${seasonId}/classes/${c.id}/edit`}
                    className="text-orange-400 hover:underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {classes.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No classes yet. Add one (e.g., GT3, GT4, LMP2).
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

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/new/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createCarClass } from "@/lib/actions/car-classes";

export default async function NewClassPage({
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

  const create = createCarClass.bind(null, slug, seasonId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">New Car Class</h1>
      </div>

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={create} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Display name <span className="text-orange-400">*</span>
          </span>
          <input
            name="name"
            required
            placeholder="GT3"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Short code <span className="text-orange-400">*</span>
          </span>
          <input
            name="shortCode"
            required
            placeholder="GT3"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Used for display. Must be unique per season.
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Display order
          </span>
          <input
            name="displayOrder"
            type="number"
            defaultValue={0}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Lower numbers appear first. Use 0, 10, 20… so you can insert later.
          </span>
        </label>
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Create Class
          </button>
          <Link
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
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

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/classes/[classId]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateCarClass, deleteCarClass } from "@/lib/actions/car-classes";

export default async function EditClassPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; classId: string }>;
}) {
  const { slug, seasonId, classId } = await params;

  const carClass = await prisma.carClass.findUnique({
    where: { id: classId },
    include: { season: { include: { league: true } } },
  });
  if (
    !carClass ||
    carClass.seasonId !== seasonId ||
    carClass.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateCarClass.bind(null, slug, seasonId, classId);
  const remove = deleteCarClass.bind(null, slug, seasonId, classId);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to classes
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit Car Class</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Display name</span>
          <input
            name="name"
            required
            defaultValue={carClass.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Short code</span>
          <input
            name="shortCode"
            required
            defaultValue={carClass.shortCode}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Display order</span>
          <input
            name="displayOrder"
            type="number"
            defaultValue={carClass.displayOrder}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>

      <form action={remove} className="border-t border-zinc-800 pt-6">
        <p className="mb-2 text-sm text-zinc-500">
          Deleting a class detaches it from any drivers in that class. Their
          registrations remain but with no class assigned.
        </p>
        <button
          type="submit"
          className="rounded border border-red-800 px-3 py-1.5 text-sm text-red-300 hover:bg-red-950"
        >
          Delete this class
        </button>
      </form>
    </div>
  );
}
EOF

# ------------------------------------------------------------
# 6. Per-registration edit page
# ------------------------------------------------------------
echo ">>> Writing per-registration edit page..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/[registrationId]/edit'

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/[registrationId]/edit/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateRegistration } from "@/lib/actions/admin-registrations";

export default async function EditRegistrationPage({
  params,
}: {
  params: Promise<{
    slug: string;
    seasonId: string;
    registrationId: string;
  }>;
}) {
  const { slug, seasonId, registrationId } = await params;

  const [registration, teams, classes] = await Promise.all([
    prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        user: true,
        season: { include: { league: true } },
      },
    }),
    prisma.team.findMany({
      where: { seasonId },
      orderBy: { name: "asc" },
    }),
    prisma.carClass.findMany({
      where: { seasonId },
      orderBy: { displayOrder: "asc" },
    }),
  ]);

  if (
    !registration ||
    registration.seasonId !== seasonId ||
    registration.season.league.slug !== slug
  ) {
    notFound();
  }

  const update = updateRegistration.bind(
    null,
    slug,
    seasonId,
    registrationId
  );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to roster
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          Edit Registration —{" "}
          <span className="text-zinc-400">
            {registration.user.firstName} {registration.user.lastName}
          </span>
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          iRacing #{registration.user.iracingMemberId} •{" "}
          {registration.user.email ?? registration.user.name}
        </p>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Status</span>
          <select
            name="status"
            defaultValue={registration.status}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="PENDING">Pending</option>
            <option value="APPROVED">Approved</option>
            <option value="REJECTED">Rejected</option>
            <option value="WITHDRAWN">Withdrawn</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Start number</span>
          <input
            name="startNumber"
            type="number"
            min={1}
            max={999}
            defaultValue={registration.startNumber ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Team</span>
          <select
            name="teamId"
            defaultValue={registration.teamId ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          >
            <option value="">No team / Independent</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {registration.season.isMulticlass && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Class</span>
            <select
              name="carClassId"
              defaultValue={registration.carClassId ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Not set —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {registration.season.proAmEnabled && (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Pro/Am</span>
            <select
              name="proAmClass"
              defaultValue={registration.proAmClass ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">— Not set —</option>
              <option value="PRO">Pro</option>
              <option value="AM">Am</option>
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              Set after a test race or based on previous league results.
            </span>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Notes</span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={registration.notes ?? ""}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
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
# 7. Update roster page to add Edit links
# ------------------------------------------------------------
echo ">>> Updating roster page with Edit links..."

cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' <<'EOF'
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  approveRegistration,
  rejectRegistration,
} from "@/lib/actions/admin-registrations";

export default async function RosterPage({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}) {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) notFound();

  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    include: {
      user: true,
      team: true,
      carClass: true,
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
  });

  const pendingCount = registrations.filter(
    (r) => r.status === "PENDING"
  ).length;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.name} {season.year}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Roster</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {registrations.length} registration
          {registrations.length === 1 ? "" : "s"}
          {pendingCount > 0 && (
            <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
              {pendingCount} pending
            </span>
          )}
        </p>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-4 py-3">Driver</th>
              <th className="px-4 py-3">iRacing ID</th>
              <th className="px-4 py-3">#</th>
              <th className="px-4 py-3">Team</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Pro/Am</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {registrations.map((r) => (
              <tr
                key={r.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-4 py-3">
                  <div className="font-medium">
                    {r.user.firstName} {r.user.lastName}
                  </div>
                  <div className="text-xs text-zinc-500">
                    {r.user.email ?? r.user.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.user.iracingMemberId ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.startNumber ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.team?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.carClass?.name ?? "—"}
                </td>
                <td className="px-4 py-3 text-zinc-400">
                  {r.proAmClass ?? "—"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <form
                          action={approveRegistration.bind(null, r.id)}
                        >
                          <button
                            type="submit"
                            className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500"
                          >
                            Approve
                          </button>
                        </form>
                        <form action={rejectRegistration.bind(null, r.id)}>
                          <button
                            type="submit"
                            className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                          >
                            Reject
                          </button>
                        </form>
                      </>
                    )}
                    <Link
                      href={`/admin/leagues/${slug}/seasons/${seasonId}/roster/${r.id}/edit`}
                      className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                    >
                      Edit
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {registrations.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-6 text-center text-zinc-500"
                >
                  No registrations yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-900 text-amber-200",
    APPROVED: "bg-emerald-900 text-emerald-200",
    REJECTED: "bg-red-900 text-red-200",
    WITHDRAWN: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
EOF

# ------------------------------------------------------------
# 8. Update admin season detail to add Teams + Classes tabs
# ------------------------------------------------------------
echo ">>> Updating admin season detail with Teams + Classes tabs..."

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
      _count: {
        select: {
          registrations: true,
          teams: true,
          carClasses: true,
        },
      },
    },
  });

  if (!season || season.league.slug !== slug) notFound();

  const pendingCount = await prisma.registration.count({
    where: { seasonId, status: "PENDING" },
  });

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

      <nav className="flex flex-wrap gap-2 border-b border-zinc-800 pb-3 text-sm">
        <span className="rounded bg-zinc-800 px-3 py-1.5 text-zinc-200">
          Calendar
        </span>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/roster`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Roster ({season._count.registrations}
          {pendingCount > 0 && (
            <span className="ml-1 rounded bg-amber-900 px-1.5 text-xs text-amber-200">
              {pendingCount}
            </span>
          )}
          )
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/teams`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Teams ({season._count.teams})
        </Link>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/classes`}
          className="rounded px-3 py-1.5 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
        >
          Classes ({season._count.carClasses})
        </Link>
      </nav>

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

# ------------------------------------------------------------
# Done
# ------------------------------------------------------------
echo ""
echo "============================================="
echo "Phase 3.2 files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo ""
echo "2. End-to-end test flow:"
echo "   a) Admin → CAS TSS GT4 → your season → Teams tab → + New Team"
echo "      Create 'Project AGM' or whatever"
echo "   b) Classes tab → + New Class → 'GT4' (only useful if season is multiclass)"
echo "   c) Roster tab → Edit on your registration row"
echo "      → set Start number, pick the Team you just created"
echo "      → set status to APPROVED → Save"
echo "   d) Refresh public season page → roster shows your team"
echo "   e) Test driver experience: register again from a clean tab"
echo "      → team dropdown now shows your created team"
echo ""
echo "3. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 3 Phase 2: teams, classes, registration edit'"
echo "   git push"
echo ""
