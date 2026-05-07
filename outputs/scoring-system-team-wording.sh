#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/scoring-systems/[id]/edit/page.tsx'

# ============================================================================
# 1. Inspect first — show the relevant lines so I can verify the patch
# ============================================================================
echo "=== Current section titles + relevant labels ==="
grep -n 'Section title\|Participation\|Fair Play\|prisma.scoringSystem' "$FILE" | head -20

# ============================================================================
# 2. Patch: pull `teamMode` flag (any season using this scoring system has
#    teamRegistration=true) and switch the section titles + descriptions.
# ============================================================================
echo ""
echo "=== Patch admin scoring-system edit page ==="
cat > /tmp/lm_patch_scoring_words.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add seasons include + teamMode computation. Anchor on the existing
//     prisma.scoringSystem.findUnique call.
if (!s.includes('teamMode')) {
  s = s.replace(
    /(const \w+ = await prisma\.scoringSystem\.findUnique\(\{[^}]*\}\);)/,
    `const ss = await prisma.scoringSystem.findUnique({
    where: { id },
    include: {
      seasons: { select: { teamRegistration: true } },
    },
  });
  const teamMode = !!ss?.seasons?.some((s) => s.teamRegistration);
  // (left below for any code expecting the original variable name)
  $1`
  );
  // The previous replacement DUPLICATED the findUnique call. We'll handle that
  // case by checking whether `ss` was already declared earlier and removing
  // the re-declaration cleanly.
  // Simpler approach: just do it differently.
}

// Reset and do a cleaner approach: locate the existing fetch, replace it
// outright with one that includes seasons + computes teamMode.
let s2 = before;
// Match the original prisma.scoringSystem.findUnique call (could be either
// form). Use a generic capture.
const fetchRe = /const (\w+) = await prisma\.scoringSystem\.findUnique\(\{\s*\n?\s*where:\s*\{\s*id\s*\}(?:,\s*include:\s*\{[\s\S]*?\})?\s*,?\s*\n?\s*\}\);/;
const m = s2.match(fetchRe);
if (!m) {
  console.error('  Could not locate prisma.scoringSystem.findUnique call.');
  process.exit(1);
}
const varName = m[1];
const includeBlock =
  `\n    include: {\n      seasons: { select: { teamRegistration: true } },\n    },`;
// Build new fetch: ensure include is in there.
const newFetch =
  `const ${varName} = await prisma.scoringSystem.findUnique({\n    where: { id },${includeBlock}\n  });\n  const teamMode = !!${varName}?.seasons?.some((s) => s.teamRegistration);`;
s2 = s2.replace(fetchRe, newFetch);

// (b) Replace the section title text. Both "Driver Fair Play Rating" and the
//     "Participation" section gain a conditional descriptor.
s2 = s2.replace(
  /<Section title="Driver Fair Play Rating \(incident-based\)">/,
  `<Section title={teamMode ? "Team Fair Play Rating (incident-based)" : "Driver Fair Play Rating (incident-based)"}>`
);

// (c) Optional: enrich the Participation section title similarly so the
//     intent is obvious. Anchor on `<Section title="Participation">`.
s2 = s2.replace(
  /<Section title="Participation">/,
  `<Section title={teamMode ? "Participation (team-based)" : "Participation"}>`
);

if (s2 === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s2);
console.log('  Patched.');
JS
node /tmp/lm_patch_scoring_words.js "$FILE"

echo ""
echo "-- Verify --"
grep -n 'teamMode\|Section title\|seasons:' "$FILE" | head -10

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
git commit -m "Scoring-system edit form: 'Driver Fair Play Rating' → 'Team Fair Play Rating' when any season using this scoring system is team-mode (IEC). Solo systems unchanged."
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  • CAS IEC scoring system edit page (/admin/scoring-systems/<iec-id>/edit)"
echo "    will show 'Team Fair Play Rating (incident-based)' and"
echo "    'Participation (team-based)'."
echo "  • All other scoring systems (CC, WCT, TSS, SFL, PCCD) keep their"
echo "    existing labels because their seasons all have teamRegistration=false."
echo ""
echo "Calculation untouched — already correct: team distance + team incidents."
