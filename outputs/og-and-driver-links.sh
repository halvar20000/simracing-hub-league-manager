#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Helper lib: src/lib/og.ts
# ============================================================================
echo "=== 1. Create src/lib/og.ts ==="
cat > src/lib/og.ts <<'TS'
import type { Metadata } from "next";

export const CLS_OG_IMAGE_URL = "/logos/cls-league-scoring.png";
export const CLS_OG_IMAGE_ALT = "CLS — CAS League Scoring";

export function pageMetadata(opts: {
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
      siteName: "CLS",
      type: "website",
      images: [{ url: CLS_OG_IMAGE_URL, alt: CLS_OG_IMAGE_ALT }],
    },
    twitter: {
      card: "summary",
      title: opts.title,
      description: opts.description,
      images: [CLS_OG_IMAGE_URL],
    },
  };
}
TS
echo "  Written."

# ============================================================================
# 2. Helper to insert generateMetadata into a page file
# ============================================================================
# Usage: insert_metadata <FILE> <BLOCK_MARKER>
# Reads /tmp/lm_meta_<MARKER>.txt and inserts before the default export.
# ============================================================================

cat > /tmp/lm_meta_inserter.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
const BLOCK_FILE = process.argv[3];
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('export async function generateMetadata') ||
    s.includes('export const metadata =') ||
    s.includes('export const metadata:')) {
  console.log('  ' + FILE + ' already has metadata — skipped.');
  process.exit(0);
}

const block = fs.readFileSync(BLOCK_FILE, 'utf8');

// Insert before the default export function
const re = /(export default async function )/;
if (!re.test(s)) {
  console.error('  ' + FILE + ': default export anchor not found.');
  process.exit(1);
}
s = s.replace(re, block + '\n$1');
fs.writeFileSync(FILE, s);
console.log('  ' + FILE + ' patched.');
JS

# ============================================================================
# 3. Per-page metadata blocks
# ============================================================================

# --- League detail ---
cat > /tmp/lm_meta_league.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league)
    return pageMetadata({
      title: "League not found",
      description: "This league does not exist or is no longer available.",
    });
  return pageMetadata({
    title: league.name,
    description:
      league.description ??
      `Live standings, rosters, and results for ${league.name}.`,
    url: `/leagues/${league.slug}`,
  });
}

TS

# --- Season detail ---
cat > /tmp/lm_meta_season.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

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
    return pageMetadata({
      title: "Season not found",
      description: "This season does not exist or is no longer available.",
    });
  const title = `${season.league.name} — ${season.name} ${season.year}`;
  const status = season.status.replace("_", " ").toLowerCase();
  return pageMetadata({
    title,
    description: `Status: ${status}. View the roster, rounds, standings, and season statistics.`,
    url: `/leagues/${slug}/seasons/${seasonId}`,
  });
}

TS

# --- Public roster ---
cat > /tmp/lm_meta_roster.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

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
    return pageMetadata({
      title: "Roster not found",
      description: "This roster does not exist or is no longer available.",
    });
  const title = `Roster — ${season.league.name} ${season.name} ${season.year}`;
  return pageMetadata({
    title,
    description: `Driver list for ${season.league.name} ${season.name} ${season.year}.`,
    url: `/leagues/${slug}/seasons/${seasonId}/roster`,
  });
}

TS

# --- Public stats ---
cat > /tmp/lm_meta_stats.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

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
    return pageMetadata({
      title: "Statistics not found",
      description: "This season does not exist or is no longer available.",
    });
  const title = `Statistics — ${season.league.name} ${season.name} ${season.year}`;
  return pageMetadata({
    title,
    description: `Driver counts, participation per round, iRating distribution, race totals.`,
    url: `/leagues/${slug}/seasons/${seasonId}/stats`,
  });
}

TS

# --- Driver profile ---
cat > /tmp/lm_meta_driver.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ iracingMemberId: string }>;
}): Promise<Metadata> {
  const { iracingMemberId } = await params;
  const user = await prisma.user.findFirst({
    where: { iracingMemberId },
  });
  if (!user)
    return pageMetadata({
      title: "Driver not found",
      description: "This driver does not exist or has not registered yet.",
    });
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return pageMetadata({
    title: `${name} — Driver profile`,
    description: `iRacing #${user.iracingMemberId}. Career stats: seasons, wins, podiums, best finishes.`,
    url: `/drivers/${iracingMemberId}`,
  });
}

TS

# --- /rosters index (static metadata) ---
cat > /tmp/lm_meta_rosters_index.txt <<'TS'
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";

export const metadata: Metadata = pageMetadata({
  title: "Rosters — All seasons",
  description: "Browse driver lists for every season across every league.",
  url: "/rosters",
});

TS

# Apply each
echo ""
echo "=== 2. Insert generateMetadata into each public page ==="

node /tmp/lm_meta_inserter.js \
  'src/app/leagues/[slug]/page.tsx' \
  /tmp/lm_meta_league.txt

node /tmp/lm_meta_inserter.js \
  'src/app/leagues/[slug]/seasons/[seasonId]/page.tsx' \
  /tmp/lm_meta_season.txt

node /tmp/lm_meta_inserter.js \
  'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' \
  /tmp/lm_meta_roster.txt

node /tmp/lm_meta_inserter.js \
  'src/app/leagues/[slug]/seasons/[seasonId]/stats/page.tsx' \
  /tmp/lm_meta_stats.txt

node /tmp/lm_meta_inserter.js \
  'src/app/drivers/[iracingMemberId]/page.tsx' \
  /tmp/lm_meta_driver.txt

# /rosters uses static metadata — different structure (no params destructure
# inside generateMetadata). Insert BEFORE default export same way.
node /tmp/lm_meta_inserter.js \
  'src/app/rosters/page.tsx' \
  /tmp/lm_meta_rosters_index.txt

# ============================================================================
# 3. Driver profile linking on admin rosters
# ============================================================================
echo ""
echo "=== 3. Add driver profile links on admin rosters ==="

# (a) Admin flat roster
node -e "
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Already has /drivers/ link?
if (s.includes('href={\`/drivers/')) {
  console.log('  Admin roster already linked.');
  process.exit(0);
}

// Wrap driver name in Link when iracingMemberId is present.
// Two cells to patch — flat path and team-grouped path.
//
// Flat path — pattern: <td><div className=\"font-medium\">{r.user.firstName} {r.user.lastName}</div>...</td>
s = s.replace(
  /<td className=\"px-4 py-3\">\s*\n\s*<div className=\"font-medium\">\s*\n\s*\{r\.user\.firstName\} \{r\.user\.lastName\}\s*\n\s*<\/div>/,
  \`<td className=\"px-4 py-3\">
                  <div className=\"font-medium\">
                    {r.user.iracingMemberId ? (
                      <Link
                        href={\\\`/drivers/\\\${r.user.iracingMemberId}\\\`}
                        className=\"hover:text-orange-400\"
                      >
                        {r.user.firstName} {r.user.lastName}
                      </Link>
                    ) : (
                      <>{r.user.firstName} {r.user.lastName}</>
                    )}
                  </div>\`
);

// Team-grouped path — pattern: <div className=\"font-medium\">{reg.user.firstName} {reg.user.lastName}{ri === 0 && ★}</div>
s = s.replace(
  /<div className=\"font-medium\">\s*\n\s*\{reg\.user\.firstName\} \{reg\.user\.lastName\}\s*\n\s*\{ri === 0 && \(/,
  \`<div className=\"font-medium\">
                          {reg.user.iracingMemberId ? (
                            <Link
                              href={\\\`/drivers/\\\${reg.user.iracingMemberId}\\\`}
                              className=\"hover:text-orange-400\"
                            >
                              {reg.user.firstName} {reg.user.lastName}
                            </Link>
                          ) : (
                            <>{reg.user.firstName} {reg.user.lastName}</>
                          )}
                          {ri === 0 && (\`
);

if (s === before) {
  console.error('  Admin roster: no anchors matched.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Admin roster patched.');
"

# ============================================================================
# 4. Verify
# ============================================================================
echo ""
echo "=== 4. Verify ==="
echo "-- og.ts --"
ls -la src/lib/og.ts
echo "-- pages with generateMetadata --"
grep -lr 'generateMetadata\|export const metadata' src/app/leagues src/app/drivers src/app/rosters 2>/dev/null | head -10
echo "-- admin roster has /drivers link --"
grep -c '/drivers/' 'src/app/admin/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' || echo "0"

# ============================================================================
# 5. TS check
# ============================================================================
echo ""
echo "=== 5. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 6. Commit + push
# ============================================================================
echo ""
echo "=== 6. Commit + push ==="
git add -A
git status --short
git commit -m "Public OG cards per page (league/season/roster/stats/driver/rosters) + driver profile links on admin rosters"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  • Each public URL shows its own title in Discord previews:"
echo "      'IEC Season 4 2026 — Roster' / 'Kevin Osiewacz — Driver profile' / etc."
echo "  • Same CLS logo thumbnail on all of them (via openGraph.images in"
echo "    pageMetadata helper)"
echo "  • Admin flat + team-grouped rosters now link driver names to their"
echo "    profile pages just like the public roster does"
echo ""
echo "Discord caches link previews aggressively — to test, paste a fresh URL"
echo "or append ?v=1 to bust the cache."
