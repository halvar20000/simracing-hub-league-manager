#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Append createTeamRegistration action
# ============================================================================
echo "=== 1. Append createTeamRegistration ==="
cat > /tmp/lm_team_reg_action.txt <<'BLOCK'

export async function createTeamRegistration(
  leagueSlug: string,
  seasonId: string,
  token: string,
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
  if (season.registrationToken && season.registrationToken !== token) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}?error=Registration+is+link-protected`
    );
  }

  const leader = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
  if (
    !leader ||
    !leader.firstName ||
    !leader.lastName ||
    !leader.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  // ---------- parse form ----------
  const teamName = String(formData.get("teamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim();
  const carId = String(formData.get("carId") ?? "").trim();
  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const errBack = (msg: string) =>
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=${encodeURIComponent(msg)}`
    );

  if (!teamName) errBack("Team name is required");
  if (!carClassId) errBack("Class is required");
  if (!carId) errBack("Car is required");

  // ---------- validate class + car ----------
  const carClass = await prisma.carClass.findUnique({
    where: { id: carClassId },
  });
  if (!carClass || carClass.seasonId !== seasonId) errBack("Invalid class");
  if (carClass!.isLocked) errBack("That class is locked — no new registrations");

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car || car.seasonId !== seasonId || car.carClassId !== carClassId) {
    errBack("Invalid car for the selected class");
  }

  // ---------- find or create Team ----------
  let team = await prisma.team.findFirst({
    where: { seasonId, name: teamName },
  });
  if (!team) {
    team = await prisma.team.create({
      data: { seasonId, name: teamName },
    });
  }

  // ---------- leader registration ----------
  await prisma.registration.upsert({
    where: { seasonId_userId: { seasonId, userId: leader!.id } },
    update: {
      status: "PENDING",
      teamId: team.id,
      carClassId,
      carId,
      startNumber,
      notes,
      approvedById: null,
      approvedAt: null,
    },
    create: {
      seasonId,
      userId: leader!.id,
      status: "PENDING",
      teamId: team.id,
      carClassId,
      carId,
      startNumber,
      notes,
    },
  });

  // ---------- teammates ----------
  type TM = { name: string; iracingId: string; email: string };
  const teammates: TM[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = String(formData.get(`teammate${i}Name`) ?? "").trim();
    const iracingId = String(formData.get(`teammate${i}IracingId`) ?? "").trim();
    const email = String(formData.get(`teammate${i}Email`) ?? "").trim();
    if (!name && !iracingId) continue;
    if (!name || !iracingId) {
      errBack(
        `Teammate row ${i}: both iRacing name and iRacing ID are required`
      );
    }
    teammates.push({ name, iracingId, email });
  }

  const teammateNames: string[] = [];
  for (const tm of teammates) {
    // Find existing user by iRacing ID, then by email, then create.
    let mate = await prisma.user.findFirst({
      where: { iracingMemberId: tm.iracingId },
    });
    if (!mate && tm.email) {
      mate = await prisma.user.findFirst({ where: { email: tm.email } });
      if (mate && !mate.iracingMemberId) {
        mate = await prisma.user.update({
          where: { id: mate.id },
          data: { iracingMemberId: tm.iracingId },
        });
      }
    }
    if (!mate) {
      const parts = tm.name.split(/\s+/);
      const firstName = parts[0] || tm.name;
      const lastName = parts.slice(1).join(" ") || "";
      mate = await prisma.user.create({
        data: {
          firstName,
          lastName,
          iracingMemberId: tm.iracingId,
          email: tm.email || null,
        },
      });
    }
    if (mate.id === leader!.id) continue; // can't be teammate of self

    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId, userId: mate.id } },
      update: {
        status: "PENDING",
        teamId: team.id,
        carClassId,
        carId,
        startNumber: null,
        approvedById: null,
        approvedAt: null,
      },
      create: {
        seasonId,
        userId: mate.id,
        status: "PENDING",
        teamId: team.id,
        carClassId,
        carId,
        startNumber: null,
      },
    });
    teammateNames.push(`${mate.firstName ?? ""} ${mate.lastName ?? ""}`.trim());
  }

  // ---------- Discord webhook (fire-and-forget) ----------
  try {
    const lg = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { discordRegistrationsWebhookUrl: true },
    });
    if (lg?.discordRegistrationsWebhookUrl) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: `🏁 New team registration — ${season.league.name} ${season.name}`,
            description:
              `**${team.name}** — ${carClass!.name} class, ${car!.name}` +
              (startNumber != null ? ` · #${startNumber}` : ""),
            url: `${baseUrl}/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`,
            color: 0xff6b35,
            fields: [
              {
                name: "Team leader",
                value: `${leader!.firstName} ${leader!.lastName} (iR ${leader!.iracingMemberId})`,
                inline: false,
              },
              ...(teammateNames.length > 0
                ? [
                    {
                      name: `Teammates (${teammateNames.length})`,
                      value: teammateNames.join("\n"),
                      inline: false,
                    },
                  ]
                : []),
              ...(notes
                ? [{ name: "Notes", value: notes, inline: false }]
                : []),
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    }
  } catch {
    // never block registration on webhook failure
  }

  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect("/registrations?success=team");
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('createTeamRegistration')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_team_reg_action.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended.');
"

# ============================================================================
# 2. Patch register/page.tsx: early return for team-mode with team form
# ============================================================================
echo ""
echo "=== 2. Patch register page ==="
cat > /tmp/lm_team_form_block.txt <<'JSX'

  if (season.teamRegistration) {
    const createTeam = createTeamRegistration.bind(
      null,
      slug,
      seasonId,
      t ?? ""
    );

    // Pre-fill teammate rows from existing team if user is the leader.
    const leaderTeamId = existing?.teamId ?? null;
    const teammateRegs = leaderTeamId
      ? await prisma.registration.findMany({
          where: {
            teamId: leaderTeamId,
            userId: { not: session.user.id },
          },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        })
      : [];
    const tmRow = (i: number) => teammateRegs[i] ?? null;

    return (
      <div className="max-w-3xl space-y-6">
        <div>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.league.name} {season.name}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {existing
              ? "Update your team registration"
              : "Register your team"}
          </h1>
          <p className="mt-1 text-sm text-zinc-400">
            Multiclass team season. Add up to 4 teammates — they&apos;ll show
            on the roster automatically. Each driver gets their own iRacing
            invitation tracked.
          </p>
        </div>

        {error && (
          <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm">
          <p className="text-zinc-400">Team leader (you):</p>
          <p className="mt-1 font-semibold text-zinc-200">
            {user.firstName} {user.lastName}{" "}
            <span className="text-zinc-500">
              (iRacing #{user.iracingMemberId})
            </span>
          </p>
        </div>

        <form action={createTeam} className="space-y-4">
          <fieldset className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="px-2 text-sm text-zinc-300">Team</legend>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">
                Team name <span className="text-orange-400">*</span>
              </span>
              <input
                name="teamName"
                required
                defaultValue={existing?.team?.name ?? ""}
                placeholder="e.g. CAS Racing #1"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
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
          </fieldset>

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
                <option key={c.id} value={c.id} disabled={c.isLocked}>
                  {c.name}
                  {c.isLocked ? " — locked (full)" : ""}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Car <span className="text-orange-400">*</span>
            </span>
            <select
              name="carId"
              required
              defaultValue={existing?.carId ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            >
              <option value="">Select car…</option>
              {carClasses
                .filter((c) => !c.isLocked && c.cars.length > 0)
                .map((c) => (
                  <optgroup key={c.id} label={c.name}>
                    {c.cars.map((car) => (
                      <option key={car.id} value={car.id}>
                        {car.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
            <span className="mt-1 block text-xs text-zinc-500">
              All teammates drive the same car. Cars from locked classes are
              hidden.
            </span>
          </label>

          <fieldset className="space-y-3 rounded border border-zinc-800 bg-zinc-900/50 p-4">
            <legend className="px-2 text-sm text-zinc-300">
              Register teammates (up to 4)
            </legend>
            <p className="text-xs text-zinc-500">
              Provide each teammate&apos;s iRacing display name and ID. Email
              is optional but helps if they later want to log in to manage
              their own profile. Empty rows are ignored.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 font-normal">iRacing name</th>
                    <th className="pb-2 pr-2 font-normal">iRacing ID</th>
                    <th className="pb-2 font-normal">Email (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((i) => {
                    const pre = tmRow(i - 1);
                    const preName = pre
                      ? `${pre.user.firstName ?? ""} ${pre.user.lastName ?? ""}`.trim()
                      : "";
                    const preIr = pre?.user.iracingMemberId ?? "";
                    const preEmail = pre?.user.email ?? "";
                    return (
                      <tr key={i}>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}Name`}
                            defaultValue={preName}
                            placeholder="John Doe"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}IracingId`}
                            defaultValue={preIr}
                            inputMode="numeric"
                            placeholder="123456"
                            className="w-32 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            name={`teammate${i}Email`}
                            type="email"
                            defaultValue={preEmail}
                            placeholder="optional@example.com"
                            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </fieldset>

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

          {paymentInfo && (
            <PaymentNotice payment={paymentInfo} variant="preview" />
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              {existing ? "Update team registration" : "Submit team registration"}
            </button>
          </div>
        </form>
      </div>
    );
  }
JSX

cat > /tmp/lm_register_team_patch.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add createTeamRegistration to the existing import line
if (!s.includes('createTeamRegistration')) {
  s = s.replace(
    /import \{ createRegistration \} from "@\/lib\/actions\/registrations";/,
    'import { createRegistration, createTeamRegistration } from "@/lib/actions/registrations";'
  );
}

// (b) Insert the early-return team-mode block right before the existing
//     `return (` line that follows the bind+isUpdate computations.
//     Anchor: the existing `return (` after the seasonHasStarted/lockedCar block.
if (!s.includes('if (season.teamRegistration)')) {
  const block = fs.readFileSync('/tmp/lm_team_form_block.txt', 'utf8');
  s = s.replace(
    /(\n\s*return \(\n\s*<div className="max-w-xl space-y-6">)/,
    block + '\n$1'
  );
}

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_register_team_patch.js

echo ""
echo "-- Verify --"
grep -n 'createTeamRegistration\|teamRegistration\|teammateRegs' 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' | head -10

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "IEC team mode (Phase 2b): team-leader registration form + createTeamRegistration action"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Test plan once deployed:"
echo "  1) Flip IEC Season 4 'Team registration OFF' → 'ON' on its admin page"
echo "  2) Open /leagues/cas-iec/seasons/<id>/register (logged in)"
echo "  3) Form should show: Team name, Start #, Class dropdown (with PCUP/LMP2/GT3),"
echo "     Car dropdown (optgrouped per class), 4 teammate rows, Notes"
echo "  4) Submit with 1-4 teammates filled — they all land on the roster as"
echo "     PENDING with the same team, class, car (admin can approve them)"
echo "  5) Locked classes show '— locked (full)' suffix and are disabled"
echo ""
echo "Phase 2c next: team-grouped roster display with the column set you"
echo "described (Registered, Team, Driver, Class, Car, iR ID, Invite, Accepted)."
