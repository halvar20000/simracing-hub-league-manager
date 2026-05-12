#!/usr/bin/env bash
# Add a pending state to the "Pull from iRLM" button using useFormStatus().
# Button text + spinner change while the server action is running.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components

# ---------------------------------------------------------------
# 1) New client component: PullFromIRLMButton
# ---------------------------------------------------------------
cat > src/components/PullFromIRLMButton.tsx <<'EOF'
"use client";

import { useFormStatus } from "react-dom";

export function PullFromIRLMButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <Spinner />
          Pulling from iRLM…
        </>
      ) : (
        "Pull from iRLM"
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-emerald-300"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
EOF
echo "Wrote src/components/PullFromIRLMButton.tsx"

# ---------------------------------------------------------------
# 2) Wire it into the admin round page (replace the inline <button>)
# ---------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-admin.mjs <<'EOF'
import fs from "node:fs";
const FILE =
  "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Add the import (right after the pullResultsFromIRLM import)
const importBefore =
  'import { pullResultsFromIRLM } from "@/lib/actions/irlm-import";';
const importAfter =
  importBefore +
  '\nimport { PullFromIRLMButton } from "@/components/PullFromIRLMButton";';
if (!s.includes('from "@/components/PullFromIRLMButton"')) {
  if (!s.includes(importBefore)) {
    console.error("import anchor missing");
    process.exit(1);
  }
  s = s.replace(importBefore, importAfter);
  console.log("imported PullFromIRLMButton.");
}

// Replace the inline <button> inside the iRLM form with <PullFromIRLMButton />.
const buttonBefore =
  '                <button\n                  type="submit"\n                  className="rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900"\n                >\n                  Pull from iRLM\n                </button>';
const buttonAfter = "                <PullFromIRLMButton />";
if (s.includes("<PullFromIRLMButton />")) {
  console.log("button already replaced.");
} else if (!s.includes(buttonBefore)) {
  console.error("button anchor missing.");
  process.exit(1);
} else {
  s = s.replace(buttonBefore, buttonAfter);
  console.log("inline button replaced with PullFromIRLMButton.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-admin.mjs
rm -rf outputs-tmp

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin: spinner + 'Pulling from iRLM…' state on the pull button"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Click Pull from iRLM -> button immediately switches to a spinner +"
echo "    'Pulling from iRLM…' label, disabled, until the import completes"
echo "    and the page redirects."
echo ""
echo "If you want a real progress percentage later (e.g., '12/35 rows'),"
echo "let me know and I'll build job-record + polling."
