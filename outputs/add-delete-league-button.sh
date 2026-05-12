#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# 1. Create a small client component for the delete confirmation
# ---------------------------------------------------------------------------
mkdir -p src/components
cat > src/components/DeleteLeagueButton.tsx <<'TSX'
"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { deleteLeague } from "@/lib/actions/leagues";

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={disabled || pending}
      className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {pending ? "Deleting…" : "Delete league permanently"}
    </button>
  );
}

export function DeleteLeagueButton({
  leagueId,
  leagueName,
  seasonCount,
}: {
  leagueId: string;
  leagueName: string;
  seasonCount: number;
}) {
  const [typed, setTyped] = useState("");
  const matches = typed.trim() === leagueName;

  return (
    <form action={deleteLeague.bind(null, leagueId)} className="space-y-3">
      <p className="text-sm text-zinc-300">
        This will permanently delete{" "}
        <span className="font-semibold text-white">{leagueName}</span> and all{" "}
        <span className="font-semibold text-white">{seasonCount}</span> season
        {seasonCount === 1 ? "" : "s"}, rounds, registrations and race results
        attached to it. <span className="font-semibold text-red-300">This cannot be undone.</span>
      </p>
      <label className="block text-sm text-zinc-400">
        Type the league name (<span className="font-mono text-zinc-200">{leagueName}</span>) to confirm:
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 focus:border-red-500 focus:outline-none"
          autoComplete="off"
        />
      </label>
      <SubmitButton disabled={!matches} />
    </form>
  );
}
TSX

echo "[+] Wrote src/components/DeleteLeagueButton.tsx"

# ---------------------------------------------------------------------------
# 2. Add a "Danger zone" section to /admin/leagues/[slug]/page.tsx
#    The page already imports from prisma + has `league` in scope. We append a
#    section just before the closing </div> of the outermost wrapper.
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Add the import (top of file).
const importLine =
  'import { DeleteLeagueButton } from "@/components/DeleteLeagueButton";';
if (!s.includes(importLine)) {
  // Insert after the last existing `import` line.
  const lines = s.split("\n");
  let lastImport = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^import /.test(lines[i])) lastImport = i;
  }
  if (lastImport === -1) {
    console.error("No import line found.");
    process.exit(1);
  }
  lines.splice(lastImport + 1, 0, importLine);
  s = lines.join("\n");
}

// 2. Make sure we know the season count.  The page already includes
// `seasons: { ... }`, so league.seasons.length is available in scope.

// 3. Find the very last `</div>` in the file (the outermost return wrapper)
//    and inject a "Danger zone" section just before it.  Done by locating the
//    last occurrence and slicing.
const danger = `

      <section className="mt-12 rounded border border-red-800/60 bg-red-950/30 p-5">
        <h2 className="text-lg font-semibold text-red-200">Danger zone</h2>
        <p className="mt-1 text-sm text-red-200/70">
          Delete this entire league — useful for cleaning up test data.
        </p>
        <div className="mt-4">
          <DeleteLeagueButton
            leagueId={league.id}
            leagueName={league.name}
            seasonCount={league.seasons.length}
          />
        </div>
      </section>
`;

// Sentinel guard so re-runs don't double-insert.
if (s.includes("Danger zone")) {
  console.log("Danger zone already present — leaving file alone.");
} else {
  const lastDiv = s.lastIndexOf("</div>");
  if (lastDiv === -1) {
    console.error("Could not find closing </div> tag.");
    process.exit(1);
  }
  s = s.slice(0, lastDiv) + danger + s.slice(lastDiv);
  console.log("Injected Danger zone section.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo "[+] Patched src/app/admin/leagues/[slug]/page.tsx"

# ---------------------------------------------------------------------------
# 3. Type-check
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# 4. Commit + push
# ---------------------------------------------------------------------------
git add -A
git commit -m "Admin: add Danger zone with type-to-confirm league delete button"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Try it: open /admin/leagues/<slug> and scroll to the bottom."
