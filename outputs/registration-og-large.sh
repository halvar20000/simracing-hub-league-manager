#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Add `pageMetadataLarge` helper to src/lib/og.ts
# ============================================================================
echo "=== 1. Add pageMetadataLarge helper ==="
node -e "
const fs = require('fs');
const FILE = 'src/lib/og.ts';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('pageMetadataLarge')) {
  console.log('  Already present.');
  process.exit(0);
}
const block = \`
export function pageMetadataLarge(opts: {
  title: string;
  description: string;
  url?: string;
}): Metadata {
  return {
    title: opts.title,
    description: opts.description,
    openGraph: {
      title: opts.title,
      description: opts.description,
      url: opts.url,
      siteName: \\\"CLS\\\",
      type: \\\"website\\\",
      images: [{ url: CLS_OG_IMAGE_URL, alt: CLS_OG_IMAGE_ALT }],
    },
    twitter: {
      card: \\\"summary_large_image\\\",
      title: opts.title,
      description: opts.description,
      images: [CLS_OG_IMAGE_URL],
    },
  };
}
\`;
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended pageMetadataLarge.');
"

# ============================================================================
# 2. Add generateMetadata to register/page.tsx with the large card + CTA copy
# ============================================================================
echo ""
echo "=== 2. Add generateMetadata to register page ==="
cat > /tmp/lm_meta_register.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadataLarge } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug)
    return pageMetadataLarge({
      title: "Registration not available",
      description:
        "This season is not currently open for registration, or the link is invalid.",
    });

  const isTeam = season.teamRegistration;
  const title = isTeam
    ? `Register your team — ${season.league.name} ${season.name} ${season.year}`
    : `Register — ${season.league.name} ${season.name} ${season.year}`;
  const description = isTeam
    ? `Click to register your team. Add up to 4 teammates, pick your class and car. Limited slots — first come first served.`
    : `Click to register for this season. Pick your car, set your start number, and you're in.`;

  return pageMetadataLarge({
    title,
    description,
    url: `/leagues/${slug}/seasons/${seasonId}/register`,
  });
}

TS

node -e "
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('export async function generateMetadata') ||
    s.includes('export const metadata =')) {
  console.log('  register/page.tsx already has metadata — skipped.');
  process.exit(0);
}
const block = fs.readFileSync('/tmp/lm_meta_register.txt', 'utf8');
const re = /(export default async function )/;
if (!re.test(s)) {
  console.error('  default export anchor not found.');
  process.exit(1);
}
s = s.replace(re, block + '\n\$1');
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

# ============================================================================
# 3. Verify
# ============================================================================
echo ""
echo "=== 3. Verify ==="
echo "-- og.ts --"
grep -n 'pageMetadataLarge' src/lib/og.ts | head -3
echo ""
echo "-- register page --"
grep -n 'generateMetadata\|pageMetadataLarge' 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' | head -5

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
git commit -m "OG: registration pages use large-image card with CTA-style description for nicer Discord embeds"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, paste a registration link in Discord:"
echo ""
echo "  Before:  long URL only, raw text"
echo "  After:   big banner card with CLS logo + 'Register your team — IEC"
echo "           Season 4 2026' + 'Click to register your team. Add up to 4"
echo "           teammates...'"
echo ""
echo "Discord caches link previews for hours. Use a fresh URL or append a"
echo "param like &v=2 to bust the cache for testing."
