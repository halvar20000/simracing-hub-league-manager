#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Generic SubmitWithSpinner component
# ===========================================================================
mkdir -p src/components
cat > src/components/SubmitWithSpinner.tsx <<'TSX'
"use client";

import { useFormStatus } from "react-dom";

export interface SubmitWithSpinnerProps {
  /** Label shown when idle. */
  label: string;
  /** Label while the action is pending (default: "<label>…"). */
  pendingLabel?: string;
  /** Tailwind classes — keep the colour theme of the original button. */
  className?: string;
  /** Optional name attribute for forms with multiple submit buttons. */
  name?: string;
  /** Optional value attribute for forms with multiple submit buttons. */
  value?: string;
  /** Force-disabled state (in addition to pending). */
  disabled?: boolean;
  /** Hex/Tailwind colour for the spinner stroke (default: currentColor). */
  spinnerColor?: string;
}

export function SubmitWithSpinner({
  label,
  pendingLabel,
  className = "rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400",
  name,
  value,
  disabled,
  spinnerColor,
}: SubmitWithSpinnerProps) {
  const { pending } = useFormStatus();
  const finalLabel = pendingLabel ?? `${label}…`;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`inline-flex items-center gap-2 ${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && <Spinner color={spinnerColor} />}
      {pending ? finalLabel : label}
    </button>
  );
}

function Spinner({ color }: { color?: string }) {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      style={color ? { color } : undefined}
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
TSX
echo "[+] Wrote src/components/SubmitWithSpinner.tsx"

# ===========================================================================
# Helper: each patch adds the import line if missing.
# ===========================================================================
add_import() {
  local file="$1"
  local importLine='import { SubmitWithSpinner } from "@/components/SubmitWithSpinner";'
  if ! grep -q 'SubmitWithSpinner' "$file"; then
    # Add after the LAST import line.
    awk -v ins="$importLine" '
      /^import / { last = NR; lines[NR] = $0; next }
      { lines[NR] = $0 }
      END {
        for (i = 1; i <= NR; i++) {
          print lines[i]
          if (i == last) print ins
        }
      }
    ' "$file" > "$file.tmp" && mv "$file.tmp" "$file"
  fi
}

# ===========================================================================
# 2. /import-json — "Import & replace" button
# ===========================================================================
PG='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import-json/page.tsx'
add_import "$PG"
cat > outputs-tmp/p1.mjs <<'EOF'
import fs from "node:fs";
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, "utf8");
const before = `          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
          >
            Import & replace
          </button>`;
const after = `          <SubmitWithSpinner
            label="Import & replace"
            pendingLabel="Importing JSON…"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
          />`;
if (s.includes("SubmitWithSpinner\n            label=\"Import & replace\"")) {
  console.log("import-json: already patched.");
} else if (!s.includes(before)) {
  console.log("import-json: anchor not found (skipping — may have changed).");
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("import-json: replaced.");
}
EOF
node outputs-tmp/p1.mjs "$PG"

# ===========================================================================
# 3. Scoring system edit — "Save (recomputes seasons)"
# ===========================================================================
PG='src/app/admin/scoring-systems/[id]/edit/page.tsx'
add_import "$PG"
cat > outputs-tmp/p2.mjs <<'EOF'
import fs from "node:fs";
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, "utf8");
const before = `          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save (recomputes seasons)
          </button>`;
const after = `          <SubmitWithSpinner
            label="Save (recomputes seasons)"
            pendingLabel="Saving + recomputing…"
            className="rounded bg-orange-500 px-4 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          />`;
if (s.includes("SubmitWithSpinner\n            label=\"Save (recomputes seasons)\"")) {
  console.log("scoring-systems edit: already patched.");
} else if (!s.includes(before)) {
  console.log("scoring-systems edit: anchor not found.");
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("scoring-systems edit: replaced.");
}
EOF
node outputs-tmp/p2.mjs "$PG"

# ===========================================================================
# 4. CSV import — "Import" button
# ===========================================================================
PG='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import/page.tsx'
add_import "$PG"
cat > outputs-tmp/p3.mjs <<'EOF'
import fs from "node:fs";
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, "utf8");
// Try a few common shapes.
const variants = [
  {
    before: `        <button
          type="submit"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Import
        </button>`,
    after: `        <SubmitWithSpinner
          label="Import"
          pendingLabel="Importing CSV…"
          className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        />`,
  },
  {
    before: `        <button
          type="submit"
          className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        >
          Import
        </button>`,
    after: `        <SubmitWithSpinner
          label="Import"
          pendingLabel="Importing CSV…"
          className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
        />`,
  },
];
let done = false;
for (const v of variants) {
  if (s.includes(v.before)) {
    s = s.replace(v.before, v.after);
    done = true;
    break;
  }
}
if (s.includes('label="Import"\n          pendingLabel="Importing CSV')) {
  console.log("import csv: already patched.");
} else if (!done) {
  console.log("import csv: anchor not found — leaving as-is.");
} else {
  fs.writeFileSync(FILE, s);
  console.log("import csv: replaced.");
}
EOF
node outputs-tmp/p3.mjs "$PG"

# ===========================================================================
# 5. Penalty pool — "Release all N pending points to standings"
# ===========================================================================
PG='src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx'
add_import "$PG"
cat > outputs-tmp/p4.mjs <<'EOF'
import fs from "node:fs";
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, "utf8");
const before = `          <button
            type="submit"
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          >
            Release all {totals.pending} pending points to standings
          </button>`;
const after = `          <SubmitWithSpinner
            label={\`Release all \${totals.pending} pending points to standings\`}
            pendingLabel="Releasing penalties…"
            className="rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-600"
          />`;
if (s.includes('label={`Release all ${totals.pending}')) {
  console.log("penalty-pool release-all: already patched.");
} else if (!s.includes(before)) {
  console.log("penalty-pool release-all: anchor not found.");
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("penalty-pool release-all: replaced.");
}
EOF
node outputs-tmp/p4.mjs "$PG"

# ===========================================================================
# 6. Steward decision — "Submit decision" / publish
# ===========================================================================
PG='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'
add_import "$PG"
cat > outputs-tmp/p5.mjs <<'EOF'
import fs from "node:fs";
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, "utf8");
// Try common shapes for the main submit decision button.
const candidates = [
  { before: `<button type="submit" className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400">Save decision</button>`,
    after:  `<SubmitWithSpinner label="Save decision" pendingLabel="Saving decision…" className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400" />` },
  { before: `<button\n            type="submit"\n            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"\n          >\n            Save decision\n          </button>`,
    after:  `<SubmitWithSpinner\n            label="Save decision"\n            pendingLabel="Saving decision…"\n            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"\n          />` },
];
let done = false;
for (const c of candidates) {
  if (s.includes(c.before)) { s = s.replace(c.before, c.after); done = true; break; }
}
if (s.includes('SubmitWithSpinner') && s.includes('label="Save decision"')) {
  console.log("reports decision: already patched (or label varies — review).");
} else if (!done) {
  console.log("reports decision: anchor not found — likely a different label. Skip.");
} else {
  fs.writeFileSync(FILE, s);
  console.log("reports decision: replaced.");
}
EOF
node outputs-tmp/p5.mjs "$PG"

rm -rf outputs-tmp

# ===========================================================================
# TS check + commit
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Spinner: add SubmitWithSpinner component + apply to JSON import, CSV import, scoring system save, penalty pool release-all, decision submit"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
