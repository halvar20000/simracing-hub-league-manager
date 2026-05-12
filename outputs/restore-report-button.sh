#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------------------
# 1. Round detail page — add "Report incident" button next to CopyLinkButton
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
`        <div className="flex items-center gap-2">
          <CopyLinkButton />
          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}\`}
            className="text-sm text-zinc-400 hover:text-zinc-100"
          >
            ← Season
          </Link>
        </div>`;

const after =
`        <div className="flex items-center gap-2">
          <CopyLinkButton />
          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/report\`}
            className="rounded border border-orange-500/60 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-200 hover:bg-orange-500/20"
          >
            ⚑ Report incident
          </Link>
          <Link
            href={\`/leagues/\${slug}/seasons/\${seasonId}\`}
            className="text-sm text-zinc-400 hover:text-zinc-100"
          >
            ← Season
          </Link>
        </div>`;

if (s.includes(after)) {
  console.log("Round page: report button already present.");
} else if (!s.includes(before)) {
  console.error("Round page: anchor not found — header CTA block has changed.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Round page: report button inserted.");
}
EOF
node outputs-tmp/patch-round.mjs

# ---------------------------------------------------------------------------
# 2. /reports — add a "How to file a new report" hint just under the header
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-reports.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = `      <h1 className="font-display text-2xl font-bold">My Reports</h1>`;

const after =
`      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">My Reports</h1>
        <details className="text-sm text-zinc-400">
          <summary className="cursor-pointer hover:text-zinc-200">
            How do I file a new report?
          </summary>
          <p className="mt-2 max-w-md text-zinc-400">
            Open the round you want to report against (Leagues → season →
            round) and click the orange{" "}
            <span className="font-semibold text-orange-200">
              ⚑ Report incident
            </span>{" "}
            button next to the share icon.
          </p>
        </details>
      </div>`;

if (s.includes("How do I file a new report?")) {
  console.log("/reports: hint already present.");
} else if (!s.includes(before)) {
  console.error("/reports: header anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("/reports: hint inserted.");
}
EOF
node outputs-tmp/patch-reports.mjs

rm -rf outputs-tmp

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
git commit -m "Reports: restore '⚑ Report incident' button on round page + add hint on /reports"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
