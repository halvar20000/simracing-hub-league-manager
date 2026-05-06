#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PUBLIC='src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'
ADMIN='src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'

# ============================================================================
# 1. Public roster: team-grouped early return
# ============================================================================
echo "=== 1. Patch public roster ==="
cat > /tmp/lm_public_team_block.txt <<'JSX'

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          where: { status: { in: ["APPROVED", "PENDING"] } },
          include: { user: true, carClass: true, car: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const teamsWithRegs = teams.filter((t) => t.registrations.length > 0);
    const driverTotal = teamsWithRegs.reduce(
      (s, t) => s + t.registrations.length,
      0
    );
    const pendingTotal = teamsWithRegs.reduce(
      (s, t) =>
        s + t.registrations.filter((r) => r.status === "PENDING").length,
      0
    );
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      });

    return (
      <div className="space-y-6">
        <div>
          <Link
            href={`/leagues/${slug}/seasons/${seasonId}`}
            className="text-sm text-zinc-400 hover:text-zinc-200"
          >
            ← {season.league.name} {season.name} {season.year}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">Team roster</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {teamsWithRegs.length} team
            {teamsWithRegs.length === 1 ? "" : "s"}
            {" · "}
            {driverTotal} driver{driverTotal === 1 ? "" : "s"}
            {pendingTotal > 0 && (
              <span className="ml-1 text-zinc-500">
                ({pendingTotal} pending)
              </span>
            )}
          </p>
        </div>

        {teamsWithRegs.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No teams registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Car</th>
                  <th className="px-4 py-3">iRacing ID</th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Invite
                  </th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Accepted
                  </th>
                </tr>
              </thead>
              <tbody>
                {teamsWithRegs.flatMap((team) =>
                  team.registrations.map((reg, ri) => (
                    <tr
                      key={reg.id}
                      className={
                        ri === 0
                          ? "border-t-2 border-zinc-700 bg-zinc-950/40"
                          : "border-t border-zinc-800 hover:bg-zinc-900"
                      }
                    >
                      <td className="px-4 py-3 align-top text-zinc-400">
                        {ri === 0 ? fmtDate(team.createdAt) : ""}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {ri === 0 && (
                          <div className="font-semibold text-zinc-100">
                            {team.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {reg.user.iracingMemberId ? (
                            <Link
                              href={`/drivers/${reg.user.iracingMemberId}`}
                              className="hover:text-orange-400"
                            >
                              {reg.user.firstName} {reg.user.lastName}
                            </Link>
                          ) : (
                            <>
                              {reg.user.firstName} {reg.user.lastName}
                            </>
                          )}
                          {ri === 0 && (
                            <span
                              className="ml-1 text-amber-400"
                              title="Team leader"
                            >
                              ★
                            </span>
                          )}
                        </div>
                        {reg.status === "PENDING" && (
                          <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                            Pending
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.carClass?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.car?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.user.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={reg.iracingInvitationSent}
                          labels={{ YES: "Sent", NO: "Not sent" }}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <FlagBadge
                          value={reg.iracingInvitationAccepted}
                          labels={{ YES: "Accepted", NO: "Not accepted" }}
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
JSX

cat > /tmp/lm_patch_public_team_roster.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('if (season.teamRegistration)')) {
  console.log('  Already patched.');
  process.exit(0);
}

// Insert the team-mode early return right after the notFound check.
const before = s;
const block = fs.readFileSync('/tmp/lm_public_team_block.txt', 'utf8');
s = s.replace(
  /(if \(!season \|\| season\.league\.slug !== slug\) notFound\(\);)/,
  '$1\n' + block
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_public_team_roster.js "$PUBLIC"

# ============================================================================
# 2. Admin roster: team-grouped early return
# ============================================================================
echo ""
echo "=== 2. Patch admin roster ==="
cat > /tmp/lm_admin_team_block.txt <<'JSX'

  if (season.teamRegistration) {
    const teams = await prisma.team.findMany({
      where: { seasonId },
      orderBy: { createdAt: "asc" },
      include: {
        registrations: {
          include: { user: true, carClass: true, car: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    const teamsWithRegs = teams.filter((t) => t.registrations.length > 0);
    const driverTotal = teamsWithRegs.reduce(
      (s, t) => s + t.registrations.length,
      0
    );
    const pendingTotal = teamsWithRegs.reduce(
      (s, t) =>
        s + t.registrations.filter((r) => r.status === "PENDING").length,
      0
    );
    const fmtDate = (d: Date) =>
      d.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
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
          <h1 className="mt-2 text-2xl font-bold">Team roster</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {teamsWithRegs.length} team
            {teamsWithRegs.length === 1 ? "" : "s"}
            {" · "}
            {driverTotal} driver{driverTotal === 1 ? "" : "s"}
            {pendingTotal > 0 && (
              <span className="ml-2 rounded bg-amber-900 px-2 py-0.5 text-xs text-amber-200">
                {pendingTotal} pending
              </span>
            )}
          </p>
        </div>

        {teamsWithRegs.length === 0 ? (
          <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
            No teams registered yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-4 py-3">Registered</th>
                  <th className="px-4 py-3">Team</th>
                  <th className="px-4 py-3">Driver</th>
                  <th className="px-4 py-3">Class</th>
                  <th className="px-4 py-3">Car</th>
                  <th className="px-4 py-3">iRacing ID</th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Invite
                  </th>
                  <th className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                      iRacing
                    </div>
                    Accepted
                  </th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {teamsWithRegs.flatMap((team) =>
                  team.registrations.map((reg, ri) => (
                    <tr
                      key={reg.id}
                      className={
                        ri === 0
                          ? "border-t-2 border-zinc-700 bg-zinc-950/40"
                          : "border-t border-zinc-800 hover:bg-zinc-900"
                      }
                    >
                      <td className="px-4 py-3 align-top text-zinc-400">
                        {ri === 0 ? fmtDate(team.createdAt) : ""}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {ri === 0 && (
                          <div className="font-semibold text-zinc-100">
                            {team.name}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {reg.user.firstName} {reg.user.lastName}
                          {ri === 0 && (
                            <span
                              className="ml-1 text-amber-400"
                              title="Team leader"
                            >
                              ★
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.carClass?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.car?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-zinc-400">
                        {reg.user.iracingMemberId ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationSent"
                          value={reg.iracingInvitationSent}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <RegistrationFlagSelect
                          registrationId={reg.id}
                          field="iracingInvitationAccepted"
                          value={reg.iracingInvitationAccepted}
                        />
                      </td>
                      <td className="px-4 py-3 text-xs">
                        <span
                          className={
                            reg.status === "APPROVED"
                              ? "rounded bg-emerald-900/40 px-2 py-0.5 text-emerald-200"
                              : reg.status === "PENDING"
                              ? "rounded bg-amber-900/40 px-2 py-0.5 text-amber-200"
                              : "rounded bg-zinc-800 px-2 py-0.5 text-zinc-400"
                          }
                        >
                          {reg.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }
JSX

cat > /tmp/lm_patch_admin_team_roster.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('if (season.teamRegistration)')) {
  console.log('  Already patched.');
  process.exit(0);
}

// Insert just after the notFound check
const before = s;
const block = fs.readFileSync('/tmp/lm_admin_team_block.txt', 'utf8');
s = s.replace(
  /(if \(!season \|\| season\.league\.slug !== slug\) notFound\(\);)/,
  '$1\n' + block
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_admin_team_roster.js "$ADMIN"

# ============================================================================
# 3. Verify
# ============================================================================
echo ""
echo "=== 3. Verify ==="
echo "-- public --"
grep -n 'season.teamRegistration\|teamsWithRegs\|fmtDate' "$PUBLIC" | head -10
echo ""
echo "-- admin --"
grep -n 'season.teamRegistration\|teamsWithRegs\|fmtDate' "$ADMIN" | head -10

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
git commit -m "IEC team mode (Phase 2c): team-grouped roster on public + admin views"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, on IEC Season 4 (teamRegistration=ON):"
echo "  Public roster /leagues/cas-iec/seasons/<id>/roster"
echo "  Admin roster  /admin/leagues/cas-iec/seasons/<id>/roster"
echo "Both show one big table grouped by team. Each team's first row shows the"
echo "registered date + team name; subsequent rows for teammates leave those"
echo "cells empty so the grouping is visually clear. The team leader has a ★."
echo ""
echo "Public uses read-only badges for Invite/Accepted; admin uses the same"
echo "auto-saving dropdown component already used on the flat admin roster."
