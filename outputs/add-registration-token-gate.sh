#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

REGFILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'
ACTFILE='src/lib/actions/registrations.ts'

# ---------------------------------------------------------------------------
# 1. Patch register page: read ?t=, gate, preserve token across signin
# ---------------------------------------------------------------------------
echo "=== 1. Patch register page ==="
cat > /tmp/lm_patch_regpage.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) searchParams type — add t?: string
s = s.replace(
  /searchParams:\s*Promise<\{\s*error\?:\s*string\s*\}>/,
  'searchParams: Promise<{ error?: string; t?: string }>'
);

// (b) destructure t from searchParams
s = s.replace(
  /const\s*\{\s*error\s*\}\s*=\s*await\s*searchParams\s*;/,
  'const { error, t } = await searchParams;'
);

// (c) preserve t on the signin callback URL
s = s.replace(
  /redirect\(\s*`\/api\/auth\/signin\?callbackUrl=\/leagues\/\$\{slug\}\/seasons\/\$\{seasonId\}\/register`\s*\);/,
  `const cbPath = \`/leagues/\${slug}/seasons/\${seasonId}/register\${t ? \`?t=\${encodeURIComponent(t)}\` : ""}\`;
    redirect(\`/api/auth/signin?callbackUrl=\${encodeURIComponent(cbPath)}\`);`
);

// (d) insert link-protected gate immediately after the notFound check
const GATE = `

  if (season.registrationToken && season.registrationToken !== t) {
    return (
      <div className="max-w-xl space-y-4">
        <Link
          href={\`/leagues/\${slug}/seasons/\${seasonId}\`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to season
        </Link>
        <h1 className="text-2xl font-bold">Registration is link-protected</h1>
        <p className="text-zinc-400">
          This season requires a personal invitation link to register. Please
          ask the league administrator for the registration link.
        </p>
      </div>
    );
  }`;

if (!s.includes('Registration is link-protected')) {
  s = s.replace(
    /(if \(!season \|\| season\.league\.slug !== slug\) notFound\(\);)/,
    '$1' + GATE
  );
}

// (e) bind token onto the action call
s = s.replace(
  /const\s+create\s*=\s*createRegistration\.bind\(null,\s*slug,\s*seasonId\)\s*;/,
  'const create = createRegistration.bind(null, slug, seasonId, t ?? "");'
);

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched register page.');
JS
node /tmp/lm_patch_regpage.js "$REGFILE"

# ---------------------------------------------------------------------------
# 2. Patch createRegistration action: accept token, validate against season
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. Patch createRegistration action ==="
cat > /tmp/lm_patch_action.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add `token: string` to the signature
s = s.replace(
  /export async function createRegistration\(\s*\n\s*leagueSlug:\s*string,\s*\n\s*seasonId:\s*string,\s*\n\s*formData:\s*FormData\s*\n\s*\)/,
  `export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
  token: string,
  formData: FormData
)`
);

// (b) Insert token validation right after the open-registration redirect block.
//     The block ends with `\n  }\n` after the redirect call.
const TOKEN_CHECK = `

  if (season.registrationToken && season.registrationToken !== token) {
    redirect(
      \`/leagues/\${leagueSlug}/seasons/\${seasonId}?error=Registration+is+link-protected\`
    );
  }
`;

if (!s.includes('season.registrationToken !== token')) {
  s = s.replace(
    /(if \(season\.status !== "OPEN_REGISTRATION" && season\.status !== "ACTIVE"\) \{\s*\n\s*redirect\(\s*\n\s*`\/leagues\/\$\{leagueSlug\}\/seasons\/\$\{seasonId\}\?error=Registration\+is\+not\+open`\s*\n\s*\);\s*\n\s*\})/,
    '$1' + TOKEN_CHECK
  );
}

if (s === before) {
  console.error('  No edits made — anchors did not match.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched createRegistration action.');
JS
node /tmp/lm_patch_action.js "$ACTFILE"

# ---------------------------------------------------------------------------
# 3. Verify
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. Verify ==="
echo "-- register page anchors --"
grep -n 'searchParams: Promise\|const { error, t }\|encodeURIComponent(cbPath)\|Registration is link-protected\|createRegistration\.bind' "$REGFILE" | head -20

echo ""
echo "-- action anchors --"
grep -n 'token: string\|registrationToken !== token' "$ACTFILE" | head -10

# ---------------------------------------------------------------------------
# 4. TypeScript check
# ---------------------------------------------------------------------------
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 5. Commit + push
# ---------------------------------------------------------------------------
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Registration: enforce per-season registrationToken on page + action"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Test plan:"
echo "  1) Generate a token on an admin season page → copy the link with ?t=..."
echo "  2) Open that link → registration form should load."
echo "  3) Strip ?t=... from the URL → should now say 'Registration is link-protected'."
echo "  4) Click 'Clear token (open registration)' on admin → bare URL works again."
