#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PUBLIC='src/app/leagues/[slug]/seasons/[seasonId]/roster/page.tsx'

echo "=== Patch public roster page ==="
cat > /tmp/lm_public_roster.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add three header cells after the Car header
if (!/>Fee</.test(s)) {
  s = s.replace(
    /<th className="px-4 py-3">Car<\/th>/,
    `<th className="px-4 py-3">Car</th>
                <th className="px-4 py-3">Fee</th>
                <th className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    iRacing
                  </div>
                  Invite
                </th>
                <th className="px-4 py-3">
                  <div className="text-[10px] uppercase tracking-wide text-zinc-500">
                    iRacing
                  </div>
                  Accepted
                </th>`
  );
}

// (b) Add three read-only badge cells after the Car cell
if (!/FlagBadge/.test(s)) {
  s = s.replace(
    /<td className="px-4 py-3 text-zinc-400">\s*\n\s*\{r\.car\?\.name \?\? "—"\}\s*\n\s*<\/td>/,
    `<td className="px-4 py-3 text-zinc-400">
                    {r.car?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.startingFeePaid}
                      labels={{ YES: "Paid", NO: "Not paid" }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.iracingInvitationSent}
                      labels={{ YES: "Sent", NO: "Not sent" }}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <FlagBadge
                      value={r.iracingInvitationAccepted}
                      labels={{ YES: "Accepted", NO: "Not accepted" }}
                    />
                  </td>`
  );
}

// (c) Append the FlagBadge component at the end of the file
if (!/^function FlagBadge/m.test(s)) {
  s = s.trimEnd() + `

function FlagBadge({
  value,
  labels,
}: {
  value: "PENDING" | "YES" | "NO";
  labels: { YES: string; NO: string };
}) {
  const safe = value === "PENDING" ? "NO" : value;
  const cls =
    safe === "YES"
      ? "border-emerald-700/50 bg-emerald-950/40 text-emerald-200"
      : "border-red-800/50 bg-red-950/40 text-red-200";
  const text = safe === "YES" ? labels.YES : labels.NO;
  return (
    <span
      className={\`inline-block rounded border px-2 py-0.5 text-xs \${cls}\`}
    >
      {text}
    </span>
  );
}
`;
}

if (s === before) {
  console.error('  No edits — page may already be patched.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_public_roster.js "$PUBLIC"

echo ""
echo "-- Verify --"
grep -n '>Fee<\|>Invite$\|>Accepted$\|FlagBadge\|function FlagBadge' "$PUBLIC" | head -20

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Public roster: add Fee / iRacing Invite / iRacing Accepted columns (read-only badges)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Then on /leagues/<slug>/seasons/<id>/roster you should see three new"
echo "columns after Car: Fee, Invite (iRacing), Accepted (iRacing). Each is a"
echo "color-coded badge — green for Paid/Sent/Accepted, red for the negative."
echo "No dropdowns — view-only. Changes still happen on the admin page."
