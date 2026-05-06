#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx'

echo "=== Replace auth redirect with rendered sign-in prompt ==="
node -e "
const fs = require('fs');
let s = fs.readFileSync('$FILE', 'utf8');
const before = s;

// Match the auth redirect block:
//   if (!session?.user?.id) {
//     const cbPath = ...;
//     redirect(\\\`/api/auth/signin?callbackUrl=\\\${encodeURIComponent(cbPath)}\\\`);
//   }
//
// Replace with a JSX return so the page still emits OG metadata for crawlers.
s = s.replace(
  /if \(!session\?\.user\?\.id\) \{\s*\n\s*const cbPath = \`\/leagues\/\\\$\{slug\}\/seasons\/\\\$\{seasonId\}\/register\\\$\{t \? \`\?t=\\\$\{encodeURIComponent\(t\)\}\` : \"\"\}\`;\s*\n\s*redirect\(\`\/api\/auth\/signin\?callbackUrl=\\\$\{encodeURIComponent\(cbPath\)\}\`\);\s*\n\s*\}/,
  \`if (!session?.user?.id) {
    const cbPath = \\\`/leagues/\\\${slug}/seasons/\\\${seasonId}/register\\\${t ? \\\`?t=\\\${encodeURIComponent(t)}\\\` : \\\"\\\"}\\\`;
    return (
      <div className=\"max-w-xl space-y-4\">
        <h1 className=\"text-2xl font-bold\">Sign in to register</h1>
        <p className=\"text-zinc-400\">
          You must be signed in with Discord to register for this season.
        </p>
        <Link
          href={\\\`/api/auth/signin?callbackUrl=\\\${encodeURIComponent(cbPath)}\\\`}
          className=\"inline-block rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-zinc-100 hover:bg-indigo-500\"
        >
          Sign in with Discord
        </Link>
      </div>
    );
  }\`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync('$FILE', s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'Sign in to register\|callbackUrl' "$FILE" | head -5

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
git commit -m "Register page: render sign-in prompt instead of redirecting unauthenticated visitors so Discord can read OG metadata"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Test:"
echo "  1) Open registration URL while logged out → see 'Sign in to register'"
echo "     page (instead of being redirected immediately)"
echo "  2) Click 'Sign in with Discord' → after signin, returns to the form"
echo "  3) Paste the same URL into a fresh Discord channel → big banner card"
echo "     with CLS logo + 'Register your team — IEC Season 4 2026' title"
