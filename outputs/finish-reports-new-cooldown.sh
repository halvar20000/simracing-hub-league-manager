#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# Show the section so we can see actual indentation
# ---------------------------------------------------------------------------
echo "=== Lines around the OPEN pill in /reports/new ==="
grep -n -A 5 'closes in {formatCountdown(w.minutesRemaining)}' \
  src/app/reports/new/page.tsx

echo ""
echo "=== Confirming we don't already have the cooldown pill ==="
grep -n 'opens in {formatCountdown' src/app/reports/new/page.tsx || echo "(no cooldown pill yet)"

# ---------------------------------------------------------------------------
# Robust insertion — find the line that has 'closes in {formatCountdown' and
# insert the cooldown pill block right before its enclosing `{w.status === "OPEN"' line.
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/new/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("opens in {formatCountdown")) {
  console.log("Cooldown pill already inserted.");
  process.exit(0);
}

const lines = s.split("\n");
let openPillStart = -1;
for (let i = 0; i < lines.length; i++) {
  if (/\{w\.status === "OPEN" && w\.minutesRemaining != null && \(/.test(lines[i])) {
    openPillStart = i;
    break;
  }
}
if (openPillStart === -1) {
  console.error("Could not find the OPEN pill line.");
  process.exit(1);
}

// Capture the leading whitespace from that line so the new block matches indent.
const indentMatch = lines[openPillStart].match(/^(\s*)/);
const indent = indentMatch ? indentMatch[1] : "                              ";

const cooldownBlock = [
  `${indent}{cooldown && w.minutesUntilOpen != null && (`,
  `${indent}  <span className="rounded bg-amber-900/40 px-2 py-0.5 text-xs text-amber-200">`,
  `${indent}    opens in {formatCountdown(w.minutesUntilOpen)}`,
  `${indent}  </span>`,
  `${indent})}`,
];

lines.splice(openPillStart, 0, ...cooldownBlock);
fs.writeFileSync(FILE, lines.join("\n"));
console.log(`Inserted cooldown pill above line ${openPillStart + 1}.`);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Reports /new: cooldown pill (amber 'opens in …') above the open pill"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
