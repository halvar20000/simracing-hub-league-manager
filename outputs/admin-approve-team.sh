#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Append approveTeamRegistrations action
# ============================================================================
echo "=== 1. Append approveTeamRegistrations action ==="
cat > /tmp/lm_approve_team_block.txt <<'BLOCK'

export async function approveTeamRegistrations(formData: FormData) {
  const me = await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { season: { include: { league: true } } },
  });
  if (!team) throw new Error("Team not found");

  await prisma.registration.updateMany({
    where: { teamId, status: "PENDING" },
    data: {
      status: "APPROVED",
      approvedAt: new Date(),
      approvedById: me.id,
    },
  });

  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
}

export async function rejectTeamRegistrations(formData: FormData) {
  await requireAdmin();
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");

  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { season: { include: { league: true } } },
  });
  if (!team) throw new Error("Team not found");

  await prisma.registration.updateMany({
    where: { teamId, status: { in: ["PENDING", "APPROVED"] } },
    data: { status: "REJECTED", approvedAt: null, approvedById: null },
  });

  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
}
BLOCK

node -e "
const fs = require('fs');
const FILE = 'src/lib/actions/admin-registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('approveTeamRegistrations')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_approve_team_block.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended.');
"

# ============================================================================
# 2. Update admin team-grouped roster: import + buttons in team header row
# ============================================================================
echo ""
echo "=== 2. Patch admin roster team-grouped section ==="
cat > /tmp/lm_admin_roster_team_buttons.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add imports
if (!s.includes('approveTeamRegistrations')) {
  s = s.replace(
    /import \{\s*\n\s*approveRegistration,\s*\n\s*rejectRegistration,\s*\n\} from "@\/lib\/actions\/admin-registrations";/,
    `import {
  approveRegistration,
  rejectRegistration,
  approveTeamRegistrations,
  rejectTeamRegistrations,
} from "@/lib/actions/admin-registrations";`
  );
}

// (b) Inject team-level approve/reject buttons inside the Team cell of the
// team header row. Anchor on the team-grouped section: the existing
// `{ri === 0 && (\n  <div className="font-semibold text-zinc-100">{team.name}</div>\n)}`.
// Replace it to include the buttons when any member is PENDING.
if (!s.includes('approveTeamRegistrations}')) {
  s = s.replace(
    /\{ri === 0 && \(\s*\n\s*<div className="font-semibold text-zinc-100">\s*\n\s*\{team\.name\}\s*\n\s*<\/div>\s*\n\s*\)\}/,
    `{ri === 0 && (
                          <div className="space-y-1.5">
                            <div className="font-semibold text-zinc-100">
                              {team.name}
                            </div>
                            {team.registrations.some(
                              (rr) => rr.status === "PENDING"
                            ) && (
                              <div className="flex flex-wrap gap-1.5">
                                <form action={approveTeamRegistrations}>
                                  <input
                                    type="hidden"
                                    name="teamId"
                                    value={team.id}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-zinc-50 hover:bg-emerald-500"
                                  >
                                    Approve team
                                  </button>
                                </form>
                                <form action={rejectTeamRegistrations}>
                                  <input
                                    type="hidden"
                                    name="teamId"
                                    value={team.id}
                                  />
                                  <button
                                    type="submit"
                                    className="rounded border border-red-800 bg-red-950/40 px-2 py-0.5 text-xs text-red-300 hover:bg-red-900/60"
                                  >
                                    Reject team
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>
                        )}`
  );
}

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_admin_roster_team_buttons.js

# ============================================================================
# 3. Verify
# ============================================================================
echo ""
echo "=== 3. Verify ==="
echo "-- action --"
grep -n 'approveTeamRegistrations\|rejectTeamRegistrations' src/lib/actions/admin-registrations.ts | head -5
echo ""
echo "-- roster --"
grep -n 'approveTeamRegistrations\|rejectTeamRegistrations' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' | head -10

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
git commit -m "Admin: add 'Approve team' / 'Reject team' buttons on the team header row of team-grouped rosters"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, on /admin/leagues/cas-iec/seasons/<id>/roster:"
echo "  • Each team header row shows 'Approve team' (green) and 'Reject team'"
echo "    (red) buttons — visible only when any member is PENDING"
echo "  • Click 'Approve team' → all PENDING members in that team flip to"
echo "    APPROVED (with approvedAt + approvedById = you)"
echo "  • Click 'Reject team' → all members go to REJECTED"
echo ""
echo "If you still want per-row approve/reject inside team mode (one button"
echo "per driver), tell me and I'll add that as a follow-up."
