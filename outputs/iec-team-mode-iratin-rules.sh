#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Schema: Registration.iRating
# ============================================================================
echo "=== 1. Schema ==="
node -e "
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
const re = /(model Registration \{[\s\S]*?)(\n\})/;
const m = s.match(re);
if (!m) { console.error('  Registration model not found.'); process.exit(1); }
if (/\n\s+iRating\s+Int\?/.test(m[1])) {
  console.log('  Already has iRating.');
} else {
  s = s.replace(re, m[1] + '\n  iRating       Int?' + m[2]);
  fs.writeFileSync(FILE, s);
  console.log('  Added Registration.iRating.');
}
"

echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ============================================================================
# 3. Team registration form: drop startNumber, add iRating fields
# ============================================================================
echo ""
echo "=== 3. Patch team form ==="
cat > /tmp/lm_team_form_patch.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Remove the startNumber <label> from the team-mode fieldset.
//     Anchor: the "Preferred start number" label with the help span underneath.
s = s.replace(
  /\s*<label className="block">\s*\n\s*<span className="mb-1 block text-sm text-zinc-300">\s*\n\s*Preferred start number\s*\n\s*<\/span>\s*\n\s*<input\s*\n\s*name="startNumber"\s*\n\s*type="number"\s*\n\s*min=\{1\}\s*\n\s*max=\{999\}\s*\n\s*defaultValue=\{existing\?\.startNumber \?\? ""\}\s*\n\s*placeholder="e\.g\. 42"\s*\n\s*className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"\s*\n\s*\/>\s*\n\s*<span className="mt-1 block text-xs text-zinc-500">\s*\n\s*Subject to availability — admin may assign a different number\.\s*\n\s*<\/span>\s*\n\s*<\/label>\s*\n/,
  '\n'
);

// (b) Add leader iRating input right after the team name </label> in the Team fieldset.
if (!s.includes('name="leaderIRating"')) {
  s = s.replace(
    /(name="teamName"[\s\S]*?<\/label>)/,
    `$1
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
                defaultValue={existing?.iRating ?? ""}
                placeholder="e.g. 2400"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-xs text-zinc-500">
                Maximum 5000 for all classes. Minimum 1500 for LMP2.
              </span>
            </label>`
  );
}

// (c) Teammate table — add iRating column header before the Email column header.
if (!/<th[^>]*>iRating<\/th>/.test(s)) {
  s = s.replace(
    /<th className="pb-2 pr-2 font-normal">iRacing ID<\/th>/,
    `<th className="pb-2 pr-2 font-normal">iRacing ID</th>
                    <th className="pb-2 pr-2 font-normal">iRating</th>`
  );
}

// (d) Teammate row — add iRating cell between iRacing ID input and email input.
if (!s.includes('teammate${i}IRating')) {
  s = s.replace(
    /(name=\{`teammate\$\{i\}IracingId`\}[\s\S]*?<\/td>)(\s*\n\s*<td className="py-1">\s*\n\s*<input\s*\n\s*name=\{`teammate\$\{i\}Email`\})/,
    `$1
                        <td className="py-1 pr-2">
                          <input
                            name={\`teammate\${i}IRating\`}
                            type="number"
                            min={0}
                            max={20000}
                            inputMode="numeric"
                            defaultValue={pre?.iRating ?? ""}
                            placeholder="2400"
                            className="w-24 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-100"
                          />
                        </td>$2`
  );
}

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_team_form_patch.js

# ============================================================================
# 4. Action: validate iRating, drop startNumber for team
# ============================================================================
echo ""
echo "=== 4. Patch createTeamRegistration ==="
cat > /tmp/lm_team_action_patch.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/registrations.ts';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

if (s.includes('LMP2_MIN_IRATING')) {
  console.log('  Already patched.');
  process.exit(0);
}

// (a) Add the constants + leader iRating parsing block. Anchor on the existing
// `const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;`
// in createTeamRegistration; we replace startNumber parsing with iRating parsing.
s = s.replace(
  /const startNumberRaw = String\(formData\.get\("startNumber"\) \?\? ""\)\.trim\(\);\s*\n\s*const startNumber = startNumberRaw \? parseInt\(startNumberRaw, 10\) : null;\s*\n/,
  `const LMP2_MIN_IRATING = 1500;
  const MAX_IRATING = 5000;

  const leaderIRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
`
);

// (b) Replace the leader registration's data { ... } to drop startNumber and add iRating
// Need to validate leaderIRating just before validating class / carClass usage.
// We'll add validation right after the class fetch so we know the shortCode.
//
// Insert iRating validation after `if (carClass!.isLocked) errBack(...)` line:
s = s.replace(
  /(if \(carClass!\.isLocked\) errBack\("That class is locked — no new registrations"\);)/,
  `$1

  if (!leaderIRatingRaw || !/^\\d+$/.test(leaderIRatingRaw)) {
    errBack("Your current iRating is required");
  }
  const leaderIRating = parseInt(leaderIRatingRaw, 10);
  if (leaderIRating > MAX_IRATING) {
    errBack(\`iRating must be \${MAX_IRATING} or lower (you entered \${leaderIRating})\`);
  }
  if (carClass!.shortCode === "LMP2" && leaderIRating < LMP2_MIN_IRATING) {
    errBack(\`LMP2 requires iRating \${LMP2_MIN_IRATING} or higher (you entered \${leaderIRating})\`);
  }`
);

// (c) Update leader registration upsert: remove startNumber, add iRating
s = s.replace(
  /(await prisma\.registration\.upsert\(\{\s*\n\s*where: \{ seasonId_userId: \{ seasonId, userId: leader!\.id \} \},\s*\n\s*update: \{\s*\n\s*status: "PENDING",\s*\n\s*teamId: team\.id,\s*\n\s*carClassId,\s*\n\s*carId,\s*\n\s*)startNumber,(\s*\n\s*notes,\s*\n\s*approvedById: null,\s*\n\s*approvedAt: null,\s*\n\s*\},\s*\n\s*create: \{\s*\n\s*seasonId,\s*\n\s*userId: leader!\.id,\s*\n\s*status: "PENDING",\s*\n\s*teamId: team\.id,\s*\n\s*carClassId,\s*\n\s*carId,\s*\n\s*)startNumber,/,
  '$1iRating: leaderIRating,$2iRating: leaderIRating,'
);

// (d) Teammate row parsing — add iRating handling. We need to validate the
// teammate's iRating against the same rules.
// Anchor on the existing teammate parse loop.
s = s.replace(
  /(for \(let i = 1; i <= 4; i\+\+\) \{\s*\n\s*const name = String\(formData\.get\(`teammate\$\{i\}Name`\) \?\? ""\)\.trim\(\);\s*\n\s*const iracingId = String\(formData\.get\(`teammate\$\{i\}IracingId`\) \?\? ""\)\.trim\(\);\s*\n\s*const email = String\(formData\.get\(`teammate\$\{i\}Email`\) \?\? ""\)\.trim\(\);\s*\n\s*if \(!name && !iracingId\) continue;\s*\n\s*if \(!name \|\| !iracingId\) \{\s*\n\s*errBack\(\s*\n\s*`Teammate row \$\{i\}: both iRacing name and iRacing ID are required`\s*\n\s*\);\s*\n\s*\})/,
  `$1
    const iratingRaw = String(formData.get(\`teammate\${i}IRating\`) ?? "").trim();
    if (!iratingRaw || !/^\\d+$/.test(iratingRaw)) {
      errBack(\`Teammate row \${i}: iRating is required and must be a number\`);
    }
    const tIrating = parseInt(iratingRaw, 10);
    if (tIrating > MAX_IRATING) {
      errBack(\`Teammate row \${i}: iRating must be \${MAX_IRATING} or lower (entered \${tIrating})\`);
    }
    if (carClass!.shortCode === "LMP2" && tIrating < LMP2_MIN_IRATING) {
      errBack(\`Teammate row \${i}: LMP2 requires iRating \${LMP2_MIN_IRATING} or higher (entered \${tIrating})\`);
    }`
);

// (e) Capture tIrating into the teammates array (extend the type + push)
s = s.replace(
  /type TM = \{ name: string; iracingId: string; email: string \};/,
  'type TM = { name: string; iracingId: string; email: string; iRating: number };'
);
s = s.replace(
  /teammates\.push\(\{ name, iracingId, email \}\);/,
  'teammates.push({ name, iracingId, email, iRating: tIrating });'
);

// (f) Save iRating on teammate Registration upsert
s = s.replace(
  /(await prisma\.registration\.upsert\(\{\s*\n\s*where: \{ seasonId_userId: \{ seasonId, userId: mate\.id \} \},\s*\n\s*update: \{\s*\n\s*status: "PENDING",\s*\n\s*teamId: team\.id,\s*\n\s*carClassId,\s*\n\s*carId,\s*\n\s*startNumber: null,\s*\n)/,
  '$1        iRating: tm.iRating,\n'
);
s = s.replace(
  /(create: \{\s*\n\s*seasonId,\s*\n\s*userId: mate\.id,\s*\n\s*status: "PENDING",\s*\n\s*teamId: team\.id,\s*\n\s*carClassId,\s*\n\s*carId,\s*\n\s*startNumber: null,\s*\n\s*\},)/,
  `create: {
        seasonId,
        userId: mate.id,
        status: "PENDING",
        teamId: team.id,
        carClassId,
        carId,
        startNumber: null,
        iRating: tm.iRating,
      },`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_team_action_patch.js

echo ""
echo "-- Verify action --"
grep -n 'LMP2_MIN_IRATING\|leaderIRating\|tm\.iRating' src/lib/actions/registrations.ts | head -10

# ============================================================================
# 5. Public team-grouped roster: add iRating column
# ============================================================================
echo ""
echo "=== 5. Patch public team roster: add iRating column ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Header: insert iRating column after iRacing ID, before iRacing Invite
//     Match the iRacing ID th and the iRacing Invite th group.
s = s.replace(
  /<th className=\"px-4 py-3\">iRacing ID<\/th>(\s*\n\s*<th className=\"px-4 py-3\">\s*\n\s*<div className=\"text-\[10px\] uppercase tracking-wide text-zinc-500\">\s*\n\s*iRacing\s*\n\s*<\/div>\s*\n\s*Invite\s*\n\s*<\/th>)/,
  '<th className=\"px-4 py-3\">iRacing ID</th>\n                  <th className=\"px-4 py-3\">iRating</th>\$1'
);

// (b) Cell: after the iRacing ID td, insert iRating td. Anchor on the iRacing ID td and the Invite/FlagBadge td.
s = s.replace(
  /(<td className=\"px-4 py-3 text-zinc-400\">\s*\n\s*\{reg\.user\.iracingMemberId \?\? \"—\"\}\s*\n\s*<\/td>)(\s*\n\s*<td className=\"px-4 py-3\">\s*\n\s*<FlagBadge\s*\n\s*value=\{reg\.iracingInvitationSent\})/,
  '\$1\n                      <td className=\"px-4 py-3 text-zinc-400\">{reg.iRating ?? \"—\"}</td>\$2'
);

if (s === before) {
  console.log('  Public team roster anchors not found (already patched or different shape).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

# ============================================================================
# 6. Admin team-grouped roster: add iRating column
# ============================================================================
echo ""
echo "=== 6. Patch admin team roster: add iRating column ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

s = s.replace(
  /<th className=\"px-4 py-3\">iRacing ID<\/th>(\s*\n\s*<th className=\"px-4 py-3\">\s*\n\s*<div className=\"text-\[10px\] uppercase tracking-wide text-zinc-500\">\s*\n\s*iRacing\s*\n\s*<\/div>\s*\n\s*Invite\s*\n\s*<\/th>)/,
  '<th className=\"px-4 py-3\">iRacing ID</th>\n                  <th className=\"px-4 py-3\">iRating</th>\$1'
);
s = s.replace(
  /(<td className=\"px-4 py-3 text-zinc-400\">\s*\n\s*\{reg\.user\.iracingMemberId \?\? \"—\"\}\s*\n\s*<\/td>)(\s*\n\s*<td className=\"px-4 py-3\">\s*\n\s*<RegistrationFlagSelect\s*\n\s*registrationId=\{reg\.id\}\s*\n\s*field=\"iracingInvitationSent\")/,
  '\$1\n                      <td className=\"px-4 py-3 text-zinc-400\">{reg.iRating ?? \"—\"}</td>\$2'
);

if (s === before) {
  console.log('  Admin team roster anchors not found.');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
"

# ============================================================================
# 7. TS check
# ============================================================================
echo ""
echo "=== 7. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 8. Commit + push
# ============================================================================
echo ""
echo "=== 8. Commit + push ==="
git add -A
git status --short
git commit -m "IEC team mode: drop start number, add iRating per driver with LMP2>=1500 and global<=5000 enforcement, show iRating on rosters"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Driver flow now:"
echo "  • Team form has no start number field"
echo "  • Leader has 'Your current iRating' input, required"
echo "  • Teammate rows now have an iRating column, required for filled rows"
echo "  • Server rejects:"
echo "      - any driver with iRating > 5000 (any class)"
echo "      - any driver in LMP2 with iRating < 1500"
echo ""
echo "Admin + public IEC roster show an iRating column between iRacing ID"
echo "and the Invite/Accepted columns."
