#!/usr/bin/env bash
# Add a "Scoring systems" link in the admin sidebar (admin-only) and a
# pill on the dashboard quick-actions row.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) Sidebar (admin/layout.tsx) — add link below Teams, admin-only
# ---------------------------------------------------------------
cat > outputs-tmp/patch-layout.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/layout.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
`            <Link
              href="/admin/teams"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Teams
            </Link>
          </>`;
const after =
`            <Link
              href="/admin/teams"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Teams
            </Link>
            <Link
              href="/admin/scoring-systems"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Scoring systems
            </Link>
          </>`;
if (s.includes('href="/admin/scoring-systems"')) {
  console.log("Layout: scoring-systems link already present.");
} else if (!s.includes(before)) {
  console.error("Layout anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Layout: added Scoring systems sidebar link.");
}
EOF
node outputs-tmp/patch-layout.mjs

# ---------------------------------------------------------------
# 2) Dashboard (admin/page.tsx) — add a pill in the quick-actions row
# ---------------------------------------------------------------
cat > outputs-tmp/patch-dashboard.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before =
`        <Link
          href="/admin/teams"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Teams
        </Link>`;
const after =
`        <Link
          href="/admin/teams"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Teams
        </Link>
        <Link
          href="/admin/scoring-systems"
          className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-zinc-300 hover:bg-zinc-800"
        >
          Scoring systems
        </Link>`;
if (s.includes('href="/admin/scoring-systems"')) {
  console.log("Dashboard: scoring-systems link already present.");
} else if (!s.includes(before)) {
  console.error("Dashboard anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Dashboard: added Scoring systems pill.");
}
EOF
node outputs-tmp/patch-dashboard.mjs

rm -rf outputs-tmp

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin nav: add Scoring systems link in sidebar + dashboard"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Every admin page sidebar has 'Scoring systems' under 'Teams'."
echo "  - Admin dashboard has a 'Scoring systems' pill in the quick-actions row."
