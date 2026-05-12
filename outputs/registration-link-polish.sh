#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Add generateMetadata to the /register page so Discord embeds show the season
# ===========================================================================
cat > outputs-tmp/patch-register-meta.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("generateMetadata")) { console.log("Register page: metadata already present."); process.exit(0); }

s = s.replace(
  `import Link from "next/link";`,
  `import Link from "next/link";\nimport type { Metadata } from "next";`
);

s = s.replace(
  `import { createRegistration } from "@/lib/actions/registrations";`,
  `import { createRegistration } from "@/lib/actions/registrations";

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
  if (!season || season.league.slug !== slug) return { title: "Register" };
  const open =
    season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE";
  const title = \`Register · \${season.league.name} \${season.name} \${season.year}\`;
  const description = open
    ? \`Sign in with Discord to register for \${season.name} \${season.year}.\`
    : \`Registration is currently closed for \${season.name} \${season.year}.\`;
  const image = season.scheduleImageUrl ?? season.league.logoUrl ?? "/logos/cas-community.webp";
  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}`
);

fs.writeFileSync(FILE, s);
console.log("Register page: generateMetadata added.");
EOF
node outputs-tmp/patch-register-meta.mjs

# ===========================================================================
# 2. Reusable "Copy link" client component
# ===========================================================================
mkdir -p src/components
cat > src/components/CopyTextButton.tsx <<'TSX'
"use client";

import { useState } from "react";

export function CopyTextButton({
  text,
  label = "Copy",
  copiedLabel = "Copied!",
  className,
}: {
  text: string;
  label?: string;
  copiedLabel?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for very old browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className={
        className ??
        "rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800"
      }
    >
      {copied ? copiedLabel : label}
    </button>
  );
}
TSX
echo "[+] Wrote src/components/CopyTextButton.tsx"

# ===========================================================================
# 3. Admin season detail page — add a "Registration link" card visible when
#    registration is open. Pulls absolute URL from NEXT_PUBLIC_SITE_URL.
# ===========================================================================
cat > outputs-tmp/patch-admin-season.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("Registration link") || s.includes("CopyTextButton")) {
  console.log("Admin season page: registration link already wired.");
  process.exit(0);
}

if (!s.includes('CopyTextButton')) {
  // Add the import after the last from "..." line.
  const importLine = 'import { CopyTextButton } from "@/components/CopyTextButton";';
  const lines = s.split("\n");
  let lastFrom = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/\bfrom\s+["']/.test(lines[i])) lastFrom = i;
  }
  lines.splice(lastFrom + 1, 0, importLine);
  s = lines.join("\n");
}

// Insert a "Registration link" section near the top of the page (after the
// Pending Registrations / Reports counts area).  Anchor: use the existing
// open-registration check pattern. Fall back to inserting at the start of the
// first <section> if no anchor matches.
const block = `
      {(season.status === "OPEN_REGISTRATION" || season.status === "ACTIVE") && (
        <section className="rounded border border-emerald-800 bg-emerald-950/30 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-sm font-semibold uppercase tracking-widest text-emerald-300">
                Registration link
              </h2>
              <p className="mt-1 text-xs text-emerald-200/80">
                Share this URL on Discord. Drivers click → Discord login → registration form.
              </p>
              <code className="mt-2 block break-all rounded bg-zinc-950 px-2 py-1 text-xs text-zinc-200">
                {(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                  \`/leagues/\${slug}/seasons/\${seasonId}/register\`}
              </code>
            </div>
            <CopyTextButton
              text={(process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com") +
                \`/leagues/\${slug}/seasons/\${seasonId}/register\`}
              label="Copy registration link"
              copiedLabel="Copied!"
              className="rounded border border-emerald-600 bg-emerald-900/40 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-800"
            />
          </div>
        </section>
      )}
`;

// Try to inject right before the first <section> in the JSX.
const sectIdx = s.indexOf("<section");
if (sectIdx === -1) { console.error("No <section> in admin season page."); process.exit(1); }
// Walk backwards to the start of the indentation of that line.
const beforeSect = s.slice(0, sectIdx);
const indentMatch = beforeSect.match(/(\n\s*)$/);
const indent = indentMatch ? indentMatch[1] : "\n      ";
s = s.slice(0, sectIdx) + block.trimStart() + indent + s.slice(sectIdx);
fs.writeFileSync(FILE, s);
console.log("Admin season page: registration-link card inserted.");
EOF
node outputs-tmp/patch-admin-season.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type-check + commit
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Registration: Discord-friendly OG metadata on /register + 'Copy registration link' card on admin season page"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
