#!/usr/bin/env bash
# Patch — let drivers create a new team during registration.
# Updates the registration server action and the registration form page.

set -euo pipefail

PROJECT_DIR="$HOME/Nextcloud/AI/league-manager"
[ ! -d "$PROJECT_DIR" ] && { echo "ERROR: project not found at $PROJECT_DIR"; exit 1; }
cd "$PROJECT_DIR"

echo "============================================="
echo "Patch — create-team-on-register"
echo "============================================="

# ------------------------------------------------------------
# 1. Update registration action with team-on-create logic
# ------------------------------------------------------------
echo ">>> Updating registration action..."

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
  const teamIdFromDropdown =
    String(formData.get("teamId") ?? "").trim() || null;
  const newTeamName = String(formData.get("newTeamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Resolve team:
  //   - If newTeamName is provided, find or create that team (it wins)
  //   - Otherwise use the team from the dropdown
  let teamId: string | null = teamIdFromDropdown;
  if (newTeamName) {
    const existingTeam = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId, name: newTeamName } },
    });
    if (existingTeam) {
      teamId = existingTeam.id;
    } else {
      const created = await prisma.team.create({
        data: { seasonId, name: newTeamName },
      });
      teamId = created.id;
    }
  }

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
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`
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
# 2. Update registration form page with "create new team" input
# ------------------------------------------------------------
echo ">>> Updating registration form page..."

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

        <fieldset className="space-y-2 rounded border border-zinc-800 bg-zinc-900/50 p-4">
          <legend className="px-2 text-sm text-zinc-300">Team</legend>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">
              Pick an existing team
            </span>
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

          <div className="text-center text-xs text-zinc-500">— or —</div>

          <label className="block">
            <span className="mb-1 block text-xs text-zinc-400">
              Create a new team
            </span>
            <input
              name="newTeamName"
              placeholder="Type a new team name to create it"
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
            <span className="mt-1 block text-xs text-zinc-500">
              If filled, this creates a new team for the season and overrides
              the dropdown above. Leave empty if you picked from the dropdown
              or are racing independently.
            </span>
          </label>
        </fieldset>

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

echo ""
echo "============================================="
echo "Patch applied."
echo "============================================="
echo ""
echo "How the new flow works:"
echo "  - Driver sees the team dropdown (with all existing teams)"
echo "  - Below it, a 'Create a new team' text input"
echo "  - If they type a name there, the action finds or creates that team"
echo "    and uses it (overriding the dropdown)"
echo "  - If left empty, the dropdown selection is used"
echo ""
echo "Next:"
echo "   npm run dev   # test locally"
echo "   git add -A && git commit -m 'Allow team creation during driver registration' && git push"
echo ""
