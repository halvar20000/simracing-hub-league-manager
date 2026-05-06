#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'

echo "=== Patch team form to treat WITHDRAWN/REJECTED as 'not registered' ==="
cat > /tmp/lm_patch_team_fresh.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) After the team-mode entry point, compute `activeRegistration` —
//     existing only if its status is APPROVED/PENDING, null otherwise.
//     Anchor on the bind line that's already inside the team-mode block.
if (!s.includes('const activeRegistration =')) {
  s = s.replace(
    /(const createTeam = createTeamRegistration\.bind\(\s*\n\s*null,\s*\n\s*slug,\s*\n\s*seasonId,\s*\n\s*t \?\? "",\s*\n\s*\);)/,
    `$1

    const activeRegistration =
      existing && existing.status !== "WITHDRAWN" && existing.status !== "REJECTED"
        ? existing
        : null;`
  );
}

// (b) Filter teammateRegs to non-withdrawn AND only when activeRegistration
//     gate the lookup on activeRegistration too.
s = s.replace(
  /const leaderTeamId = existing\?\.teamId \?\? null;\s*\n\s*const teammateRegs = leaderTeamId\s*\n\s*\? await prisma\.registration\.findMany\(\{\s*\n\s*where: \{\s*\n\s*teamId: leaderTeamId,\s*\n\s*userId: \{ not: session\.user\.id \},\s*\n\s*\},\s*\n\s*include: \{ user: true \},\s*\n\s*orderBy: \{ createdAt: "asc" \},\s*\n\s*\}\)\s*\n\s*: \[\];/,
  `const leaderTeamId = activeRegistration?.teamId ?? null;
    const teammateRegs = leaderTeamId
      ? await prisma.registration.findMany({
          where: {
            teamId: leaderTeamId,
            userId: { not: session.user.id },
            status: { notIn: ["WITHDRAWN", "REJECTED"] },
          },
          include: { user: true },
          orderBy: { createdAt: "asc" },
        })
      : [];`
);

// (c) Title — was `{existing ? "Update..." : "Register..."}`
s = s.replace(
  /\{existing\s*\n\s*\? "Update your team registration"\s*\n\s*: "Register your team"\}/,
  '{activeRegistration\n              ? "Update your team registration"\n              : "Register your team"}'
);

// (d) Pre-fills — replace `existing?.team?.name`, `existing?.iRating`,
//     `existing?.carClassId`, `existing?.carId`, `existing?.notes`
//     with their activeRegistration counterparts.
//     Use `replace_all` style by being narrow about each occurrence.
s = s.replace(/defaultValue=\{existing\?\.team\?\.name \?\? ""\}/g, 'defaultValue={activeRegistration?.team?.name ?? ""}');
s = s.replace(/defaultValue=\{existing\?\.iRating \?\? ""\}/g, 'defaultValue={activeRegistration?.iRating ?? ""}');
s = s.replace(/defaultClassId=\{existing\?\.carClassId \?\? undefined\}/g, 'defaultClassId={activeRegistration?.carClassId ?? undefined}');
s = s.replace(/defaultCarId=\{existing\?\.carId \?\? undefined\}/g, 'defaultCarId={activeRegistration?.carId ?? undefined}');
s = s.replace(/defaultValue=\{existing\?\.notes \?\? ""\}/g, 'defaultValue={activeRegistration?.notes ?? ""}');

// (e) Submit button label
s = s.replace(
  /\{existing \? "Update team registration" : "Submit team registration"\}/,
  '{activeRegistration ? "Update team registration" : "Submit team registration"}'
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_team_fresh.js "$FILE"

echo ""
echo "-- Verify --"
grep -n 'activeRegistration\|"Update your team\|"Register your team\|"Submit team' "$FILE" | head -10

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Team registration form: treat WITHDRAWN/REJECTED registration as 'not registered' so re-registration shows the new-team flow"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, opening the IEC registration link with a withdrawn team"
echo "will say 'Register your team' (not 'Update'), with empty defaults."
echo "Submitting creates a fresh team via the existing upsert flow — the"
echo "WITHDRAWN registration row gets re-used and flipped back to PENDING."
