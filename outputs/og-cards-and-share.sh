#!/usr/bin/env bash
# OpenGraph cards + share button:
#  - root layout: metadataBase so relative og:image URLs resolve
#  - round / season / league / standings pages: generateMetadata with title,
#    description, og:image
#  - <CopyLinkButton> client component, wired into the round page header
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components outputs-tmp

# ---------------------------------------------------------------
# 1) <CopyLinkButton> client component
# ---------------------------------------------------------------
cat > src/components/CopyLinkButton.tsx <<'EOF'
"use client";

import { useState } from "react";

export function CopyLinkButton({
  className,
  label = "Share",
}: {
  className?: string;
  label?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    if (typeof window === "undefined") return;
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select-all in a temp textarea
      const ta = document.createElement("textarea");
      ta.value = window.location.href;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
      }
      title="Copy link to clipboard"
    >
      {copied ? (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-emerald-400"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Copied
        </>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
EOF
echo "Wrote src/components/CopyLinkButton.tsx"

# ---------------------------------------------------------------
# 2) Set metadataBase in the root layout (so relative og:image works)
# ---------------------------------------------------------------
cat > outputs-tmp/patch-layout.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/layout.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("metadataBase:")) {
  console.log("layout: metadataBase already set.");
} else {
  // Insert metadataBase into the existing `metadata` export.
  const before = "export const metadata: Metadata = {";
  const after =
    'export const metadata: Metadata = {\n  metadataBase: new URL(\n    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com"\n  ),';
  if (s.includes(before)) {
    s = s.replace(before, after);
    fs.writeFileSync(FILE, s);
    console.log("layout: metadataBase added.");
  } else {
    console.warn("layout: metadata export anchor not found; please add metadataBase manually.");
  }
}
EOF
node outputs-tmp/patch-layout.mjs

# ---------------------------------------------------------------
# 3) Round page — generateMetadata + CopyLinkButton in header
# ---------------------------------------------------------------
cat > outputs-tmp/patch-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Imports
if (!s.includes('from "@/components/CopyLinkButton"')) {
  s = s.replace(
    'import { CountryFlag } from "@/components/CountryFlag";',
    'import { CountryFlag } from "@/components/CountryFlag";\nimport { CopyLinkButton } from "@/components/CopyLinkButton";\nimport type { Metadata } from "next";'
  );
  console.log("round page: imports added.");
}

// (b) Add generateMetadata before the page component default export.
if (!s.includes("export async function generateMetadata")) {
  const insertAnchor = "export default async function PublicRoundResults(";
  const meta =
`export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId, roundId } = await params;
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      season: { include: { league: true } },
      raceResults: {
        include: { registration: { include: { user: true } } },
      },
    },
  });
  if (
    !round ||
    round.season.league.slug !== slug ||
    round.seasonId !== seasonId
  ) {
    return { title: "Round not found" };
  }

  // Compute top 3 by aggregated round total (handles multi-race)
  type Agg = {
    name: string;
    total: number;
    classified: boolean;
  };
  const m = new Map<string, Agg>();
  for (const r of round.raceResults) {
    const name = (
      \`\${r.registration.user.firstName ?? ""} \${r.registration.user.lastName ?? ""}\`
    ).trim();
    let a = m.get(r.registrationId);
    if (!a) {
      a = { name, total: 0, classified: false };
      m.set(r.registrationId, a);
    }
    a.total +=
      r.rawPointsAwarded +
      r.participationPointsAwarded -
      r.manualPenaltyPoints +
      (r.correctionPoints ?? 0);
    if (r.finishStatus === "CLASSIFIED") a.classified = true;
  }
  const top3 = [...m.values()]
    .filter((a) => a.classified)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  const title = \`\${round.season.league.name} R\${round.roundNumber} — \${round.track}\`;
  const description =
    top3.length === 3
      ? \`🥇 \${top3[0].name} · 🥈 \${top3[1].name} · 🥉 \${top3[2].name}\`
      : \`\${round.name} · \${round.season.name} \${round.season.year}\`;
  const image = round.season.league.logoUrl ?? "/logos/cas-community.webp";

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "article",
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [image],
    },
  };
}

`;
  if (!s.includes(insertAnchor)) {
    console.error("round page: page component anchor not found");
    process.exit(1);
  }
  s = s.replace(insertAnchor, meta + insertAnchor);
  console.log("round page: generateMetadata added.");
}

// (c) Insert CopyLinkButton in the round header next to "← Season"
if (!s.includes("<CopyLinkButton")) {
  const headerAnchor =
    '<Link\n          href={`/leagues/${slug}/seasons/${seasonId}`}\n          className="text-sm text-zinc-400 hover:text-zinc-100"\n        >\n          ← Season\n        </Link>';
  const headerReplace =
    '<div className="flex items-center gap-2">\n          <CopyLinkButton />\n          ' +
    '<Link\n            href={`/leagues/${slug}/seasons/${seasonId}`}\n            className="text-sm text-zinc-400 hover:text-zinc-100"\n          >\n            ← Season\n          </Link>\n        </div>';
  if (s.includes(headerAnchor)) {
    s = s.replace(headerAnchor, headerReplace);
    console.log("round page: CopyLinkButton added to header.");
  } else {
    console.warn("round page: header anchor not found; skipping CopyLinkButton wiring.");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-round.mjs

# ---------------------------------------------------------------
# 4) Season page — generateMetadata
# ---------------------------------------------------------------
cat > outputs-tmp/patch-season.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('import type { Metadata }')) {
  s = s.replace(
    'import { SeasonHero } from "@/components/SeasonHero";',
    'import { SeasonHero } from "@/components/SeasonHero";\nimport type { Metadata } from "next";'
  );
}

if (!s.includes("export async function generateMetadata")) {
  const insertAnchor = "export default async function PublicSeasonDetail(";
  const meta =
`export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) {
    return { title: "Season not found" };
  }
  const title = \`\${season.league.name} — \${season.name} \${season.year}\`;
  const description = season.scheduleImageUrl
    ? \`Race calendar, standings, and results for \${season.name} \${season.year}.\`
    : \`Standings and results for \${season.name} \${season.year}.\`;
  const image = season.scheduleImageUrl ?? season.league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      images: [image],
    },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

`;
  if (!s.includes(insertAnchor)) {
    console.error("season page: anchor missing");
    process.exit(1);
  }
  s = s.replace(insertAnchor, meta + insertAnchor);
  console.log("season page: generateMetadata added.");
} else {
  console.log("season page: generateMetadata already present.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-season.mjs

# ---------------------------------------------------------------
# 5) League page — generateMetadata
# ---------------------------------------------------------------
cat > outputs-tmp/patch-league.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('import type { Metadata }')) {
  s = s.replace(
    'import { NextRaceHero } from "@/components/NextRaceHero";',
    'import { NextRaceHero } from "@/components/NextRaceHero";\nimport type { Metadata } from "next";'
  );
}

if (!s.includes("export async function generateMetadata")) {
  const insertAnchor = "export default async function PublicLeagueDetail(";
  const meta =
`export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) return { title: "League not found" };
  const title = league.name;
  const description = league.description ?? \`Standings, schedules, and results for \${league.name}.\`;
  const image = league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

`;
  if (!s.includes(insertAnchor)) {
    console.error("league page: anchor missing");
    process.exit(1);
  }
  s = s.replace(insertAnchor, meta + insertAnchor);
  console.log("league page: generateMetadata added.");
} else {
  console.log("league page: generateMetadata already present.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-league.mjs

# ---------------------------------------------------------------
# 6) Standings page — generateMetadata
# ---------------------------------------------------------------
cat > outputs-tmp/patch-stand.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('import type { Metadata }')) {
  // Insert near the top — after the existing imports
  s = s.replace(
    'import { computeDriverStandings,',
    'import type { Metadata } from "next";\nimport { computeDriverStandings,'
  );
}

if (!s.includes("export async function generateMetadata")) {
  const insertAnchor = "export default async function StandingsPage(";
  const meta =
`export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; seasonId: string }>;
}): Promise<Metadata> {
  const { slug, seasonId } = await params;
  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) {
    return { title: "Standings not found" };
  }
  const title = \`Standings — \${season.league.name} \${season.name} \${season.year}\`;
  const description = \`Live driver and team standings for \${season.name} \${season.year}.\`;
  const image = season.league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

`;
  if (!s.includes(insertAnchor)) {
    console.error("standings page: anchor missing");
    process.exit(1);
  }
  s = s.replace(insertAnchor, meta + insertAnchor);
  console.log("standings page: generateMetadata added.");
} else {
  console.log("standings page: generateMetadata already present.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-stand.mjs

rm -rf outputs-tmp

git add -A
git commit -m "OpenGraph metadata on round/season/league/standings + Share button on round page"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, test:"
echo "  - Paste a round URL into Discord / Slack -> embed shows league name,"
echo "    'R# - <track>', podium description, league logo as image."
echo "  - On any round page, click 'Share' (top right) -> URL copies to"
echo "    clipboard with a green check confirmation."
echo "  - Same metadata works for season + league + standings pages."
