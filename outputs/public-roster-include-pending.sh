#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Public roster page: show APPROVED + PENDING; small badge for PENDING
# ============================================================================
echo "=== 1. Patch public roster ==="
cat > /tmp/lm_public_pending.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Query: APPROVED -> APPROVED + PENDING
s = s.replace(
  /where: \{ seasonId, status: "APPROVED" \},/,
  'where: { seasonId, status: { in: ["APPROVED", "PENDING"] } },'
);

// (b) Header text: "X approved drivers" -> "X drivers (Y pending)"
//     Compute the pending count near the top of the function.
if (!s.includes('const pendingCount =')) {
  s = s.replace(
    /(const showClass = season\.isMulticlass;)/,
    `$1
  const pendingCount = registrations.filter((r) => r.status === "PENDING").length;`
  );
}

// (c) Replace the driver-count paragraph
s = s.replace(
  /\{registrations\.length\} approved\{" "\}\s*\n\s*\{registrations\.length === 1 \? "driver" : "drivers"\}/,
  `{registrations.length}{" "}
          {registrations.length === 1 ? "driver" : "drivers"}
          {pendingCount > 0 && (
            <span className="ml-1 text-zinc-500">
              ({pendingCount} pending)
            </span>
          )}`
);

// (d) Driver name cell — append a small "Pending" badge when status is PENDING.
//     The cell currently looks like:
//       <td className="px-4 py-3">
//         <div className="font-medium">
//           ...name JSX...
//         </div>
//       </td>
//     We'll inject a sibling badge after the </div>.
s = s.replace(
  /(<td className="px-4 py-3">\s*\n\s*<div className="font-medium">[\s\S]*?<\/div>)(\s*\n\s*<\/td>)/,
  `$1
                    {r.status === "PENDING" && (
                      <div className="mt-0.5 inline-block rounded bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-200">
                        Pending
                      </div>
                    )}$2`
);

// (e) Empty-state message
s = s.replace(
  /No approved drivers yet\./,
  'No drivers registered yet.'
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_public_pending.js

echo "-- Verify --"
grep -n 'status: { in:\|pendingCount\|"PENDING"\|No drivers registered' 'src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx' | head -10

# ============================================================================
# 2. /rosters index: count includes APPROVED + PENDING
# ============================================================================
echo ""
echo "=== 2. Patch /rosters index count ==="
cat > /tmp/lm_rosters_idx.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/rosters/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

s = s.replace(
  /where: \{ status: "APPROVED" \},/,
  'where: { status: { in: ["APPROVED", "PENDING"] } },'
);

if (s === before) {
  console.log('  Already patched (or anchor not found).');
} else {
  fs.writeFileSync(FILE, s);
  console.log('  Patched.');
}
JS
node /tmp/lm_rosters_idx.js

echo "-- Verify --"
grep -n 'status:' src/app/rosters/page.tsx | head -3

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Public roster: show APPROVED + PENDING drivers; badge pending; /rosters count matches"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, public per-season roster shows every registered driver"
echo "(APPROVED and PENDING). Pending drivers get a small amber 'Pending' tag"
echo "next to their name. Header reads e.g. '24 drivers (3 pending)'."
echo "REJECTED and WITHDRAWN registrations stay hidden from the public view."
