#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: Team.leaderUserId
# ============================================================================
echo "=== 1. Schema ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const re = /(model Team \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  Team model not found.'); process.exit(1); }
if (/\n\s+leaderUserId/.test(m[1])) {
  console.log('  Already has leaderUserId.');
} else {
  s = s.replace(re, m[1] + '\n  leaderUserId  String?' + m[2]);
  fs.writeFileSync(FILE, s);
  console.log('  Added Team.leaderUserId.');
}
"

# ============================================================================
# 2. Push + generate
# ============================================================================
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Backfill leaderUserId on existing teams
# ============================================================================
echo ""
echo "=== 3. Backfill leaderUserId ==="
cat > ./_backfill_leader.cjs <<'JS'
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const teams = await p.team.findMany({
    include: {
      registrations: {
        orderBy: { createdAt: 'asc' },
        take: 1,
        select: { userId: true },
      },
    },
  });
  let updated = 0;
  let skipped = 0;
  for (const t of teams) {
    if (t.leaderUserId) { skipped++; continue; }
    if (t.registrations.length === 0) { skipped++; continue; }
    await p.team.update({
      where: { id: t.id },
      data: { leaderUserId: t.registrations[0].userId },
    });
    updated++;
  }
  console.log('  Updated ' + updated + ' team(s); skipped ' + skipped + ' (already set or no regs).');
  await p.$disconnect();
})();
JS
node ./_backfill_leader.cjs
rm ./_backfill_leader.cjs

# ============================================================================
# 4. createTeamRegistration: set leaderUserId on team creation
# ============================================================================
echo ""
echo "=== 4. Patch createTeamRegistration to set leaderUserId ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /(team = await prisma\.team\.create\(\{\s*\n\s*data: \{ seasonId, name: teamName)( \},\s*\n\s*\}\);)/,
  '\$1, leaderUserId: leader!.id\$2'
);
if (s === before) {
  console.log('  Already set or anchor not found.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

# ============================================================================
# 5. Append 3 new server actions: updateTeamRegistration / withdrawTeam /
#    transferTeamLeadership
# ============================================================================
echo ""
echo "=== 5. Append management actions ==="
cat > /tmp/lm_team_mgmt_actions.txt <<'BLOCK'

const TEAM_LMP2_MIN_IRATING = 1500;
const TEAM_MAX_IRATING = 5000;

async function requireTeamLeader(teamId: string) {
  const sessionUser = await requireAuth();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      season: { include: { league: true } },
      registrations: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!team) throw new Error("Team not found");
  if (team.leaderUserId !== sessionUser.id) {
    throw new Error("Only the team leader can perform this action");
  }
  return { team, sessionUser };
}

export async function updateTeamRegistration(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  const carClass = team.registrations[0]?.carClassId
    ? await prisma.carClass.findUnique({
        where: { id: team.registrations[0].carClassId! },
      })
    : null;

  // Leader iRating
  const leaderRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
  if (!leaderRatingRaw || !/^\d+$/.test(leaderRatingRaw)) {
    throw new Error("Your current iRating is required");
  }
  const leaderIRating = parseInt(leaderRatingRaw, 10);
  if (leaderIRating > TEAM_MAX_IRATING) {
    throw new Error(
      `iRating must be ${TEAM_MAX_IRATING} or lower (you entered ${leaderIRating})`
    );
  }
  if (carClass?.shortCode === "LMP2" && leaderIRating < TEAM_LMP2_MIN_IRATING) {
    throw new Error(
      `LMP2 requires iRating ${TEAM_LMP2_MIN_IRATING} or higher (you entered ${leaderIRating})`
    );
  }

  // Update leader registration's iRating
  await prisma.registration.update({
    where: {
      seasonId_userId: {
        seasonId: team.seasonId,
        userId: team.leaderUserId!,
      },
    },
    data: { iRating: leaderIRating },
  });

  // Parse + validate teammate rows
  type TM = {
    name: string;
    iracingId: string;
    email: string;
    iRating: number;
  };
  const tmIn: TM[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = String(formData.get(`teammate${i}Name`) ?? "").trim();
    const iracingId = String(formData.get(`teammate${i}IracingId`) ?? "").trim();
    const email = String(formData.get(`teammate${i}Email`) ?? "").trim();
    const iratingRaw = String(formData.get(`teammate${i}IRating`) ?? "").trim();
    if (!name && !iracingId && !iratingRaw) continue;
    if (!name || !iracingId) {
      throw new Error(
        `Teammate row ${i}: both iRacing name and iRacing ID are required`
      );
    }
    if (!iratingRaw || !/^\d+$/.test(iratingRaw)) {
      throw new Error(`Teammate row ${i}: iRating is required`);
    }
    const iR = parseInt(iratingRaw, 10);
    if (iR > TEAM_MAX_IRATING) {
      throw new Error(
        `Teammate row ${i}: iRating must be ${TEAM_MAX_IRATING} or lower (entered ${iR})`
      );
    }
    if (carClass?.shortCode === "LMP2" && iR < TEAM_LMP2_MIN_IRATING) {
      throw new Error(
        `Teammate row ${i}: LMP2 requires iRating ${TEAM_LMP2_MIN_IRATING} or higher (entered ${iR})`
      );
    }
    tmIn.push({ name, iracingId, email, iRating: iR });
  }

  // Existing teammates (active, not the leader)
  const existingTeammates = team.registrations.filter(
    (r) => r.userId !== team.leaderUserId && r.status !== "WITHDRAWN"
  );

  const seenUserIds = new Set<string>();

  for (const tm of tmIn) {
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
    if (mate.id === team.leaderUserId) continue;

    const existingReg = team.registrations.find((r) => r.userId === mate!.id);

    if (existingReg && existingReg.status !== "WITHDRAWN") {
      // Existing — preserve invitation flags, just update what changed
      await prisma.registration.update({
        where: { id: existingReg.id },
        data: { iRating: tm.iRating },
      });
    } else {
      // New (or previously withdrawn) — reset invitation flags
      await prisma.registration.upsert({
        where: {
          seasonId_userId: { seasonId: team.seasonId, userId: mate.id },
        },
        update: {
          status: "PENDING",
          teamId: team.id,
          carClassId: team.registrations[0]?.carClassId,
          carId: team.registrations[0]?.carId,
          startNumber: null,
          iRating: tm.iRating,
          iracingInvitationSent: "NO",
          iracingInvitationAccepted: "NO",
        },
        create: {
          seasonId: team.seasonId,
          userId: mate.id,
          status: "PENDING",
          teamId: team.id,
          carClassId: team.registrations[0]?.carClassId,
          carId: team.registrations[0]?.carId,
          startNumber: null,
          iRating: tm.iRating,
          iracingInvitationSent: "NO",
          iracingInvitationAccepted: "NO",
        },
      });
    }
    seenUserIds.add(mate.id);
  }

  // Withdraw any existing teammate not present in the form
  for (const r of existingTeammates) {
    if (!seenUserIds.has(r.userId)) {
      await prisma.registration.update({
        where: { id: r.id },
        data: { status: "WITHDRAWN" },
      });
    }
  }

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/teams/${teamId}/manage`);
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=team_updated`);
}

export async function withdrawTeam(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  await prisma.registration.updateMany({
    where: { teamId },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=team_withdrawn`);
}

export async function transferTeamLeadership(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const newLeaderUserId = String(formData.get("newLeaderUserId") ?? "");
  if (!teamId) throw new Error("teamId required");
  if (!newLeaderUserId) throw new Error("New leader is required");

  const { team, sessionUser } = await requireTeamLeader(teamId);

  const newLeaderReg = team.registrations.find(
    (r) => r.userId === newLeaderUserId && r.status !== "WITHDRAWN"
  );
  if (!newLeaderReg) {
    throw new Error("New leader must be a current team member (not withdrawn)");
  }
  if (newLeaderUserId === sessionUser.id) {
    throw new Error("New leader cannot be yourself");
  }

  await prisma.$transaction([
    prisma.team.update({
      where: { id: teamId },
      data: { leaderUserId: newLeaderUserId },
    }),
    prisma.registration.updateMany({
      where: { teamId, userId: sessionUser.id },
      data: { status: "WITHDRAWN" },
    }),
  ]);

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=leadership_transferred`);
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('updateTeamRegistration')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_team_mgmt_actions.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended 3 actions.');
"

# ============================================================================
# 6. Manage page at /teams/[teamId]/manage/page.tsx
# ============================================================================
echo ""
echo "=== 6. Create manage page ==="
mkdir -p 'src/app/teams/[teamId]/manage'
PAGE='src/app/teams/[teamId]/manage/page.tsx'
if [ -f "$PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PAGE" <<'TSX'
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  updateTeamRegistration,
  withdrawTeam,
  transferTeamLeadership,
} from "@/lib/actions/registrations";

export default async function ManageTeamPage({
  params,
}: {
  params: Promise<{ teamId: string }>;
}) {
  const { teamId } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect(
      `/api/auth/signin?callbackUrl=/teams/${teamId}/manage`
    );
  }

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      season: {
        include: {
          league: true,
          carClasses: { include: { cars: true } },
        },
      },
      registrations: {
        include: { user: true, carClass: true, car: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!team) notFound();

  const isLeader = team.leaderUserId === session.user.id;
  const leaderReg = team.registrations.find(
    (r) => r.userId === team.leaderUserId
  );
  const teammates = team.registrations.filter(
    (r) => r.userId !== team.leaderUserId && r.status !== "WITHDRAWN"
  );

  if (!isLeader) {
    return (
      <div className="space-y-4">
        <Link
          href="/registrations"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← My registrations
        </Link>
        <h1 className="text-2xl font-bold">Team management</h1>
        <p className="rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-200">
          Only the current team leader can manage this team. The leader is{" "}
          <strong>
            {team.registrations.find((r) => r.userId === team.leaderUserId)
              ?.user.firstName}{" "}
            {team.registrations.find((r) => r.userId === team.leaderUserId)
              ?.user.lastName}
          </strong>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <Link
          href="/registrations"
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← My registrations
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Manage team</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {team.name} · {team.season.league.name} {team.season.name}{" "}
          {team.season.year} · {leaderReg?.carClass?.name} ·{" "}
          {leaderReg?.car?.name}
        </p>
      </div>

      {/* === Update form === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Edit team
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Class and car cannot be changed here. To change them, withdraw the
          team and re-register. iRating limits still apply
          {leaderReg?.carClass?.shortCode === "LMP2"
            ? " (LMP2: ≥ 1500)"
            : ""}
          {" "}— max 5000 for any class.
        </p>
        <form
          action={updateTeamRegistration}
          className="space-y-4 rounded border border-zinc-800 bg-zinc-900/50 p-4"
        >
          <input type="hidden" name="teamId" value={team.id} />

          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">
              Your current iRating <span className="text-orange-400">*</span>
            </span>
            <input
              name="leaderIRating"
              type="number"
              min={0}
              max={20000}
              required
              defaultValue={leaderReg?.iRating ?? ""}
              className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
            />
          </label>

          <fieldset className="space-y-3">
            <legend className="text-sm text-zinc-300">
              Teammates (up to 4)
            </legend>
            <p className="text-xs text-zinc-500">
              Add a brand-new driver to add a teammate (their Invite/Accepted
              flags reset). Clear a row to withdraw that teammate. Existing
              teammates keep their flags when their data is unchanged.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="pb-2 pr-2 font-normal">iRacing name</th>
                    <th className="pb-2 pr-2 font-normal">iRacing ID</th>
                    <th className="pb-2 pr-2 font-normal">iRating</th>
                    <th className="pb-2 font-normal">Email (optional)</th>
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3, 4].map((i) => {
                    const pre = teammates[i - 1] ?? null;
                    const preName = pre
                      ? `${pre.user.firstName ?? ""} ${pre.user.lastName ?? ""}`.trim()
                      : "";
                    const preIr = pre?.user.iracingMemberId ?? "";
                    const preEmail = pre?.user.email ?? "";
                    const preRating = pre?.iRating ?? "";
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
                        <td className="py-1 pr-2">
                          <input
                            name={`teammate${i}IRating`}
                            type="number"
                            min={0}
                            max={20000}
                            defaultValue={preRating}
                            placeholder="2400"
                            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>
                        <td className="py-1">
                          <input
                            name={`teammate${i}Email`}
                            type="email"
                            defaultValue={preEmail}
                            placeholder="optional"
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

          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
        </form>
      </section>

      {/* === Transfer leadership === */}
      {teammates.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
            Transfer leadership
          </h2>
          <p className="mb-3 text-xs text-zinc-500">
            Pick a teammate to take over as team leader. Your registration
            will be withdrawn. The new leader can manage the team afterwards.
          </p>
          <form
            action={transferTeamLeadership}
            className="flex flex-wrap items-end gap-3 rounded border border-zinc-800 bg-zinc-900/50 p-4"
          >
            <input type="hidden" name="teamId" value={team.id} />
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">
                New leader
              </span>
              <select
                name="newLeaderUserId"
                required
                defaultValue=""
                className="w-64 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100"
              >
                <option value="" disabled>
                  Choose teammate…
                </option>
                {teammates.map((r) => (
                  <option key={r.userId} value={r.userId}>
                    {r.user.firstName} {r.user.lastName}
                    {r.user.iracingMemberId
                      ? ` (iR ${r.user.iracingMemberId})`
                      : ""}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="rounded border border-amber-700/50 bg-amber-950/30 px-3 py-2 text-sm text-amber-200 hover:bg-amber-900/50"
            >
              Transfer + withdraw me
            </button>
          </form>
        </section>
      )}

      {/* === Withdraw team === */}
      <section>
        <h2 className="mb-3 font-display text-sm font-semibold uppercase tracking-widest text-zinc-500">
          Withdraw entire team
        </h2>
        <p className="mb-3 text-xs text-zinc-500">
          Marks every team member&apos;s registration as withdrawn. The team
          will no longer appear on the roster. Cannot be undone from here —
          contact admin if needed.
        </p>
        <form
          action={withdrawTeam}
          className="rounded border border-red-900/40 bg-red-950/20 p-4"
        >
          <input type="hidden" name="teamId" value={team.id} />
          <button
            type="submit"
            className="rounded border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-200 hover:bg-red-900/60"
          >
            Withdraw the whole team
          </button>
        </form>
      </section>
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 7. /registrations: link to /teams/[teamId]/manage when user is leader
# ============================================================================
echo ""
echo "=== 7. Patch /registrations: add Manage team link ==="
cat > /tmp/lm_reg_team_link.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/registrations/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('/teams/${r.team.id}/manage')) {
  console.log('  Already linked.');
  process.exit(0);
}

// Insert a "Manage team" link inside each registration card. Anchor on the
// existing PaymentNotice IIFE (inserted earlier) — put the link after it but
// before the card's closing </div>.
//
// Instead, simpler anchor: just before the existing PaymentNotice IIFE we
// added in the previous PayPal feature. Use the marker `(() => {` that
// starts that IIFE.
s = s.replace(
  /(\{\(\(\) => \{\s*\n\s*const pi = getLeaguePayment\(r\.season\.league\);)/,
  `{r.season.teamRegistration && r.team && r.team.leaderUserId === session.user.id && (
                <div className="mt-3">
                  <Link
                    href={\`/teams/\${r.team.id}/manage\`}
                    className="inline-block rounded border border-orange-700 bg-orange-950/30 px-3 py-1.5 text-xs font-medium text-orange-300 hover:bg-orange-900/40"
                  >
                    Manage team →
                  </Link>
                </div>
              )}
              $1`
);

if (s === before) {
  console.error('  Anchor not found — paste the relevant snippet so I can write a tighter regex.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_reg_team_link.js

# ============================================================================
# 8. TS check
# ============================================================================
echo ""
echo "=== 8. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 9. Commit + push
# ============================================================================
echo ""
echo "=== 9. Commit + push ==="
git add -A
git status --short
git commit -m "Team mgmt: leader can edit teammates, withdraw team, or transfer leadership via /teams/[teamId]/manage"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, on /registrations you (as the team leader) get a"
echo "'Manage team →' link on the IEC team card. The page lets you:"
echo "  • Edit your iRating + the teammate roster (new drivers reset"
echo "    Invite/Accepted; existing keep theirs; cleared rows withdraw)"
echo "  • Transfer leadership to a teammate (you get withdrawn)"
echo "  • Withdraw the entire team"
