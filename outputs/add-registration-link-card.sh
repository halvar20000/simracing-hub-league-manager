#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Schema: add Season.registrationToken
# ---------------------------------------------------------------------------
echo "=== 1. Schema: add Season.registrationToken ==="
cat > /tmp/lm_patch_schema.js <<'JS'
const fs = require('fs');
const FILE = 'prisma/schema.prisma';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('registrationToken')) {
  console.log('  Already has registrationToken — skipping schema edit.');
  process.exit(0);
}
const re = /(model Season \{[\s\S]*?)\n\}/;
const m = s.match(re);
if (!m) {
  console.error('  Could not find Season model.');
  process.exit(1);
}
s = s.replace(re, m[1] + '\n  registrationToken String? @unique\n}');
fs.writeFileSync(FILE, s);
console.log('  Added registrationToken field.');
JS
node /tmp/lm_patch_schema.js

# ---------------------------------------------------------------------------
# 2. Push schema to Neon, regen client
# ---------------------------------------------------------------------------
echo ""
echo "=== 2. prisma db push + generate ==="
npx prisma db push --accept-data-loss
npx prisma generate

# ---------------------------------------------------------------------------
# 3. CopyTextButton client component
# ---------------------------------------------------------------------------
echo ""
echo "=== 3. Create src/components/CopyTextButton.tsx ==="
mkdir -p src/components
if [ -f src/components/CopyTextButton.tsx ]; then
  echo "  Already exists — leaving alone."
else
cat > src/components/CopyTextButton.tsx <<'TSX'
"use client";
import { useState } from "react";

export default function CopyTextButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700 ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch (e) {
          console.error("Copy failed", e);
        }
      }}
    >
      {copied ? "Copied!" : label}
    </button>
  );
}
TSX
  echo "  Created."
fi

# ---------------------------------------------------------------------------
# 4. Token actions in src/lib/actions/seasons.ts
# ---------------------------------------------------------------------------
echo ""
echo "=== 4. Append token actions to src/lib/actions/seasons.ts ==="

# Block we want to append (kept in a separate file so quoting is sane)
cat > /tmp/lm_actions_block.txt <<'BLOCK'

export async function regenerateRegistrationToken(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const token = crypto.randomUUID();
  const season = await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: token },
    include: { league: true },
  });
  revalidatePath(`/admin/leagues/${season.league.slug}/seasons/${season.id}`);
}

export async function clearRegistrationToken(formData: FormData) {
  await requireAdmin();
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!seasonId) throw new Error("seasonId required");
  const season = await prisma.season.update({
    where: { id: seasonId },
    data: { registrationToken: null },
    include: { league: true },
  });
  revalidatePath(`/admin/leagues/${season.league.slug}/seasons/${season.id}`);
}
BLOCK

cat > /tmp/lm_patch_seasons.js <<'JS'
const fs = require('fs');
const FILE = 'src/lib/actions/seasons.ts';
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('regenerateRegistrationToken')) {
  console.log('  Actions already present — skipping.');
  process.exit(0);
}

// Make sure required imports exist (most should already be there).
function ensureImport(line) {
  if (!s.includes(line)) {
    // insert at top, after any "use server" directive on line 1
    if (s.startsWith('"use server"') || s.startsWith("'use server'")) {
      const nl = s.indexOf('\n');
      s = s.slice(0, nl + 1) + line + '\n' + s.slice(nl + 1);
    } else {
      s = line + '\n' + s;
    }
  }
}
if (!/from ["']next\/cache["']/.test(s) || !/revalidatePath/.test(s)) {
  ensureImport('import { revalidatePath } from "next/cache";');
}
if (!/requireAdmin/.test(s)) {
  ensureImport('import { requireAdmin } from "@/lib/auth-helpers";');
}
if (!/from ["']@\/lib\/prisma["']/.test(s)) {
  ensureImport('import { prisma } from "@/lib/prisma";');
}

const block = fs.readFileSync('/tmp/lm_actions_block.txt', 'utf8');
s = s.trimEnd() + '\n' + block + '\n';
fs.writeFileSync(FILE, s);
console.log('  Appended regenerateRegistrationToken + clearRegistrationToken.');
JS
node /tmp/lm_patch_seasons.js

# ---------------------------------------------------------------------------
# 5. Admin season page: add imports + insert the card
# ---------------------------------------------------------------------------
echo ""
echo "=== 5. Patch admin season page ==="

# JSX card kept in its own file (literal, no escaping needed)
cat > /tmp/lm_card.txt <<'JSX'
      <section className="rounded border border-emerald-700/40 bg-emerald-900/10 p-4 space-y-3">
        <h2 className="text-lg font-semibold">Registration link</h2>
        {(() => {
          const baseUrl =
            process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXTAUTH_URL || "";
          const path = `/leagues/${slug}/seasons/${season.id}/register`;
          const url = season.registrationToken
            ? `${baseUrl}${path}?t=${season.registrationToken}`
            : `${baseUrl}${path}`;
          return (
            <div className="space-y-3">
              {season.registrationToken ? (
                <p className="text-sm text-emerald-300">
                  Token-protected — only people with this exact link can register.
                </p>
              ) : (
                <p className="text-sm text-amber-300">
                  Open registration — anyone signed in can register without a token.
                </p>
              )}
              <code className="block break-all rounded bg-zinc-900 border border-zinc-800 p-2 text-xs">
                {url}
              </code>
              <div className="flex flex-wrap gap-2">
                <CopyTextButton text={url} label="Copy registration link" />
                <form action={regenerateRegistrationToken}>
                  <input type="hidden" name="seasonId" value={season.id} />
                  <button
                    type="submit"
                    className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                  >
                    {season.registrationToken
                      ? "Regenerate token"
                      : "Generate token (link-only)"}
                  </button>
                </form>
                {season.registrationToken && (
                  <form action={clearRegistrationToken}>
                    <input type="hidden" name="seasonId" value={season.id} />
                    <button
                      type="submit"
                      className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
                    >
                      Clear token (open registration)
                    </button>
                  </form>
                )}
              </div>
            </div>
          );
        })()}
      </section>

JSX

cat > /tmp/lm_patch_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');

// 1) Imports
if (!s.includes('CopyTextButton')) {
  const anchor = 'import { formatDateTime } from "@/lib/date";';
  if (!s.includes(anchor)) {
    console.error('  Import anchor not found — bailing.');
    process.exit(1);
  }
  s = s.replace(
    anchor,
    anchor +
      '\nimport CopyTextButton from "@/components/CopyTextButton";' +
      '\nimport { regenerateRegistrationToken, clearRegistrationToken } from "@/lib/actions/seasons";'
  );
  console.log('  Added imports.');
} else {
  console.log('  Imports already present.');
}

// 2) Insert card just before the "Race calendar" <section>
if (!s.includes('Registration link')) {
  // The first occurrence of `      <section>\n` (6-space indent + bare <section>)
  // is the calendar section per inspection (line 149). The earlier one at line 140
  // has a className=, so it does not match this pattern.
  const ANCHOR = '      <section>\n';
  const idx = s.indexOf(ANCHOR);
  if (idx === -1) {
    console.error('  Card insertion anchor not found.');
    process.exit(1);
  }
  const card = fs.readFileSync('/tmp/lm_card.txt', 'utf8');
  s = s.slice(0, idx) + card + s.slice(idx);
  console.log('  Inserted Registration link card.');
} else {
  console.log('  Card already present.');
}

fs.writeFileSync(FILE, s);
JS
node /tmp/lm_patch_page.js

# ---------------------------------------------------------------------------
# 6. Verify the patches landed
# ---------------------------------------------------------------------------
echo ""
echo "=== 6. Verify ==="
echo "-- schema --"
grep -n 'registrationToken' prisma/schema.prisma || echo "  MISSING"
echo "-- actions --"
grep -n 'regenerateRegistrationToken\|clearRegistrationToken' src/lib/actions/seasons.ts | head -10
echo "-- page imports + card --"
grep -n 'CopyTextButton\|Registration link\|regenerateRegistrationToken' \
  'src/app/admin/leagues/[slug]/seasons/[seasonId]/page.tsx' | head -20

# ---------------------------------------------------------------------------
# 7. TypeScript check
# ---------------------------------------------------------------------------
echo ""
echo "=== 7. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 8. Commit & push
# ---------------------------------------------------------------------------
echo ""
echo "=== 8. Commit + push ==="
git add -A
git status --short
git commit -m "Admin: add per-season Registration link card with optional token gate"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Refresh:  https://league.simracing-hub.com/admin/leagues/<slug>/seasons/<seasonId>"
echo "You should see a green-bordered 'Registration link' card under the stat tiles."
echo ""
echo "NOTE: The registration *page* itself may not yet enforce the token."
echo "Once you confirm the card is visible, we'll add the gate next so the URL"
echo "without ?t=... shows a 'link-protected' message."
