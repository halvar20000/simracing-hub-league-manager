#!/usr/bin/env bash
# Week 3 Phase 1 — Driver registration flow + minimal admin roster
# Adds profile page, registration form, my-registrations page,
# admin roster list with approve/reject, plus nav updates.
#
# Usage:
#   bash week3-phase1-setup.sh

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Week 3 Phase 1 — Registration flow"
echo "============================================="

ensure_dir() { mkdir -p "$1"; }

# ------------------------------------------------------------
# 1. Profile server action
# ------------------------------------------------------------
echo ">>> Writing profile action..."

cat > src/lib/actions/profile.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function updateProfile(formData: FormData) {
  const sessionUser = await requireAuth();

  const firstName = String(formData.get("firstName") ?? "").trim() || null;
  const lastName = String(formData.get("lastName") ?? "").trim() || null;
  const email = String(formData.get("email") ?? "").trim() || null;
  const iracingMemberIdRaw = String(formData.get("iracingMemberId") ?? "").trim();
  const iracingMemberId = iracingMemberIdRaw || null;

  if (iracingMemberId && !/^\d+$/.test(iracingMemberId)) {
    redirect("/profile?error=iRacing+member+ID+must+be+a+number");
  }

  try {
    await prisma.user.update({
      where: { id: sessionUser.id },
      data: { firstName, lastName, email, iracingMemberId },
    });
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("Unique constraint")) {
      redirect("/profile?error=That+iRacing+ID+is+already+used+by+another+account");
    }
    throw e;
  }

  revalidatePath("/profile");
  redirect("/profile?success=1");
}
EOF

# ------------------------------------------------------------
# 2. Registration server actions (driver side)
# ------------------------------------------------------------
echo ">>> Writing registration actions..."

cat > src/lib/actions/registrations.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";

export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect("/leagues");
  }

  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}?error=Registration+is+not+open`
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
  if (
    !user ||
    !user.firstName ||
    !user.lastName ||
    !user.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const teamId = String(formData.get("teamId") ?? "").trim() || null;
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  if (season.isMulticlass && !carClassId) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Class+is+required+for+multiclass+seasons`
    );
  }

  const existing = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId, userId: user.id } },
  });

  if (existing && existing.status === "APPROVED") {
    redirect(
      `/registrations?error=You+are+already+approved+for+this+season`
    );
  }

  if (existing) {
    await prisma.registration.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
        approvedById: null,
        approvedAt: null,
      },
    });
  } else {
    await prisma.registration.create({
      data: {
        seasonId,
        userId: user.id,
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
      },
    });
  }

  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`
  );
  redirect("/registrations?success=1");
}

export async function withdrawRegistration(registrationId: string) {
  const sessionUser = await requireAuth();

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { season: { include: { league: true } } },
  });
  if (!reg || reg.userId !== sessionUser.id) {
    redirect("/registrations");
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath("/registrations");
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  redirect("/registrations");
}
EOF

# ------------------------------------------------------------
# 3. Admin registration actions (approve / reject)
# ------------------------------------------------------------
echo ">>> Writing admin registration actions..."

cat > src/lib/actions/admin-registrations.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

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
EOF

# ------------------------------------------------------------
# 4. Profile page
# ------------------------------------------------------------
echo ">>> Writing profile page..."
ensure_dir src/app/profile

cat > src/app/profile/page.tsx <<'EOF'
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { updateProfile } from "@/lib/actions/profile";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/profile");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) redirect("/api/auth/signin");

  const { error, success } = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Required before you can register for a season.
        </p>
      </div>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Profile saved.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <form action={updateProfile} className="space-y-4">
        <Field
          label="First name"
          name="firstName"
          required
          defaultValue={user.firstName ?? ""}
        />
        <Field
          label="Last name"
          name="lastName"
          required
          defaultValue={user.lastName ?? ""}
        />
        <Field
          label="Email"
          name="email"
          type="email"
          defaultValue={user.email ?? ""}
        />
        <Field
          label="iRacing member ID"
          name="iracingMemberId"
          required
          defaultValue={user.iracingMemberId ?? ""}
          help="Numeric ID. Find it on iracing.com → My Account → Member ID."
        />

        <button
          type="submit"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  help,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  help?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-zinc-300">
        {label} {required && <span className="text-orange-400">*</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
      />
      {help && <span className="mt-1 block text-xs text-zinc-500">{help}</span>}
    </label>
  );
}
EOF

# ------------------------------------------------------------
# 5. Registration form page
# ------------------------------------------------------------
echo ">>> Writing registration form page..."
ensure_dir 'src/app/leagues/[slug]/seasons/[seasonId]/register'

cat > 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' <<'EOF'
import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { createRegistration } from "@/lib/actions/registrations";

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { slug, seasonId } = await params;
  const { error } = await searchParams;

  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=/leagues/${slug}/seasons/${seasonId}/register`
    );
  }

  const [season, user, teams, carClasses, existing] = await Promise.all([
    prisma.season.findUnique({
      where: { id: seasonId },
      include: { league: true },
    }),
    prisma.user.findUnique({ where: { id: session.user.id } }),
    prisma.team.findMany({
      where: { seasonId },
      orderBy: { name: "asc" },
    }),
    prisma.carClass.findMany({
      where: { seasonId },
      orderBy: { displayOrder: "asc" },
    }),
    prisma.registration.findUnique({
      where: { seasonId_userId: { seasonId, userId: session.user.id } },
    }),
  ]);

  if (!season || season.league.slug !== slug) notFound();
  if (!user) redirect("/api/auth/signin");

  if (!user.firstName || !user.lastName || !user.iracingMemberId) {
    redirect(
      `/profile?error=Please+complete+your+profile+before+registering`
    );
  }

  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    return (
      <div className="space-y-4">
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">Registration is not open</h1>
        <p className="text-zinc-400">
          {season.name} {season.year} is currently in status{" "}
          <code className="rounded bg-zinc-800 px-1.5 py-0.5">
            {season.status.replace("_", " ")}
          </code>
          .
        </p>
      </div>
    );
  }

  const create = createRegistration.bind(null, slug, seasonId);
  const isUpdate =
    existing &&
    existing.status !== "WITHDRAWN" &&
    existing.status !== "REJECTED";

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}/seasons/${seasonId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name} {season.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">
          {isUpdate ? "Update your registration" : "Register for this season"}
        </h1>
      </div>

      {isUpdate && (
        <div className="rounded border border-amber-800 bg-amber-950 p-3 text-sm text-amber-200">
          You already have a {existing.status.toLowerCase()} registration.
          Submitting will reset it to PENDING for re-approval.
        </div>
      )}

      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
        <p className="text-zinc-400">Registering as:</p>
        <p className="mt-1 font-semibold text-zinc-200">
          {user.firstName} {user.lastName}{" "}
          <span className="text-zinc-500">
            (iRacing #{user.iracingMemberId})
          </span>
        </p>
        <Link
          href="/profile"
          className="mt-2 inline-block text-xs text-orange-400 hover:underline"
        >
          Edit profile
        </Link>
      </div>

      <form action={create} className="space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Preferred start number
          </span>
          <input
            name="startNumber"
            type="number"
            min={1}
            max={999}
            defaultValue={existing?.startNumber ?? ""}
            placeholder="e.g. 42"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Subject to availability — admin may assign a different number.
          </span>
        </label>

        {teams.length > 0 ? (
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Team</span>
            <select
              name="teamId"
              defaultValue={existing?.teamId ?? ""}
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
        ) : (
          <p className="text-xs text-zinc-500">
            No teams created yet for this season. The admin can assign you to a
            team after registration.
          </p>
        )}

        {season.isMulticlass &&
          (carClasses.length > 0 ? (
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Class <span className="text-orange-400">*</span>
              </span>
              <select
                name="carClassId"
                required
                defaultValue={existing?.carClassId ?? ""}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="">Select class…</option>
                {carClasses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="rounded border border-amber-800 bg-amber-950 p-3 text-xs text-amber-200">
              This is a multiclass season but no classes have been defined yet.
              Ask the admin to add car classes before registering.
            </div>
          ))}

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Notes (optional)
          </span>
          <textarea
            name="notes"
            rows={3}
            defaultValue={existing?.notes ?? ""}
            placeholder="Anything you want the admin to know"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
          />
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            {isUpdate ? "Update registration" : "Submit registration"}
          </button>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
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
# 6. My Registrations page
# ------------------------------------------------------------
echo ">>> Writing my registrations page..."
ensure_dir src/app/registrations

cat > src/app/registrations/page.tsx <<'EOF'
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withdrawRegistration } from "@/lib/actions/registrations";

export default async function MyRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/registrations");
  }

  const { success, error } = await searchParams;

  const registrations = await prisma.registration.findMany({
    where: { userId: session.user.id },
    include: {
      season: { include: { league: true } },
      team: true,
      carClass: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Registrations</h1>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Registration submitted. Awaiting admin approval.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-400">
            You haven&apos;t registered for any seasons yet.
          </p>
          <Link
            href="/leagues"
            className="mt-2 inline-block text-orange-400 hover:underline"
          >
            Browse leagues →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => (
            <div
              key={r.id}
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {r.season.league.name} — {r.season.name} {r.season.year}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                    <StatusBadge status={r.status} />
                    {r.startNumber && (
                      <span className="text-zinc-500">
                        # {r.startNumber}
                      </span>
                    )}
                    {r.team && (
                      <span className="text-zinc-500">
                        • {r.team.name}
                      </span>
                    )}
                    {r.carClass && (
                      <span className="text-zinc-500">
                        • {r.carClass.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link
                    href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}`}
                    className="text-orange-400 hover:underline"
                  >
                    View season
                  </Link>
                  {(r.status === "PENDING" || r.status === "APPROVED") && (
                    <form
                      action={withdrawRegistration.bind(null, r.id)}
                    >
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-400"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                  {(r.status === "WITHDRAWN" || r.status === "REJECTED") && (
                    <Link
                      href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}/register`}
                      className="text-orange-400 hover:underline"
                    >
                      Re-register
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
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
# 7. Admin roster list page (with approve/reject)
# ------------------------------------------------------------
echo ">>> Writing admin roster page..."
ensure_dir 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster'

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

  const pendingCount = registrations.filter((r) => r.status === "PENDING")
    .length;

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
                    {r.status === "APPROVED" && (
                      <form action={rejectRegistration.bind(null, r.id)}>
                        <button
                          type="submit"
                          className="rounded bg-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-600"
                        >
                          Revoke
                        </button>
                      </form>
                    )}
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

      <p className="text-xs text-zinc-500">
        Phase 2 will add per-registration edit (start number override, team
        assignment, Pro/Am classification).
      </p>
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
# 8. Update nav with Profile + My Registrations links
# ------------------------------------------------------------
echo ">>> Updating nav..."

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
    <nav className="border-b border-zinc-800 bg-zinc-950 text-zinc-100">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Simracing-Hub&apos;s League Manager
        </Link>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/leagues" className="hover:text-orange-400">
            Leagues
          </Link>
          {session?.user && (
            <>
              <Link href="/registrations" className="hover:text-orange-400">
                My Registrations
              </Link>
              <Link href="/profile" className="hover:text-orange-400">
                Profile
              </Link>
            </>
          )}
          {isAdmin && (
            <Link href="/admin" className="hover:text-orange-400">
              Admin
            </Link>
          )}
          {session?.user ? (
            <>
              <span className="hidden text-zinc-500 md:inline">
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
# 9. Update public season page to add Register button
# ------------------------------------------------------------
echo ">>> Updating public season page with Register button..."

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

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/leagues/${slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← {season.league.name}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">
              {season.name} {season.year}
            </h1>
            <p className="mt-1 text-sm text-zinc-400">
              {season.scoringSystem.name} • {season.status.replace("_", " ")}
              {season.isMulticlass && " • Multiclass"}
              {season.proAmEnabled && " • Pro/Am"}
            </p>
          </div>
          {registrationOpen && (
            <Link
              href={`/leagues/${slug}/seasons/${seasonId}/register`}
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Register for this season →
            </Link>
          )}
        </div>
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
                  <td
                    colSpan={5}
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
        <h2 className="mb-3 text-lg font-semibold">
          Roster ({season.registrations.length} approved)
        </h2>
        {season.registrations.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No approved drivers yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Team</th>
                  {season.isMulticlass && (
                    <th className="px-4 py-3">Class</th>
                  )}
                  {season.proAmEnabled && (
                    <th className="px-4 py-3">Pro/Am</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {season.registrations.map((r) => (
                  <tr key={r.id} className="border-t border-zinc-800">
                    <td className="px-4 py-3 text-zinc-500">
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
# 10. Update admin season detail to add Roster link
# ------------------------------------------------------------
echo ">>> Updating admin season detail with Roster link..."

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
echo "Phase 3.1 files written."
echo "============================================="
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Test locally:"
echo "   npm run dev"
echo "   Open http://localhost:3000"
echo ""
echo "2. End-to-end test flow:"
echo "   a) Sign in (you should see new nav links: My Registrations, Profile)"
echo "   b) Click Profile → fill in first name, last name, iRacing ID → Save"
echo "   c) Go to Admin → Leagues → CAS GT3 WCT → create a 2026 season →"
echo "      set status to OPEN_REGISTRATION → add 1-2 rounds"
echo "   d) Go to Leagues (public view) → click your CAS GT3 WCT → click your season"
echo "      → click 'Register for this season' → fill form → submit"
echo "   e) Check My Registrations — should show PENDING"
echo "   f) Go to Admin → Leagues → CAS GT3 WCT → your season → click Roster tab"
echo "      → click Approve next to your name"
echo "   g) Refresh My Registrations — should now show APPROVED"
echo "   h) Refresh public season page — your name should appear in the roster"
echo ""
echo "3. Commit and push:"
echo "   git add -A"
echo "   git commit -m 'Week 3 Phase 1: registration flow + admin roster'"
echo "   git push"
echo ""
