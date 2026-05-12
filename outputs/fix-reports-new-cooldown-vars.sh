#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# Quick state probe
echo "=== State probe ==="
grep -n 'protestCooldownHours' src/app/reports/new/page.tsx || echo "(no protestCooldownHours yet)"
echo ""
grep -n 'const cooldown\|const blocked\|const closed = w.status' src/app/reports/new/page.tsx || echo "(no closed/cooldown/blocked vars yet)"
echo ""

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/new/page.tsx";
let lines = fs.readFileSync(FILE, "utf8").split("\n");
let changed = false;

// ---------------------------------------------------------------------------
// 1. Make sure scoringSystem select pulls protestCooldownHours.
//    Only patches the line if it's still the old single-field select.
// ---------------------------------------------------------------------------
for (let i = 0; i < lines.length; i++) {
  if (
    lines[i].includes("scoringSystem:") &&
    lines[i].includes("protestWindowHours: true") &&
    !lines[i].includes("protestCooldownHours: true")
  ) {
    lines[i] = lines[i].replace(
      "select: { protestWindowHours: true }",
      "select: { protestCooldownHours: true, protestWindowHours: true }"
    );
    console.log(`Updated scoringSystem select at line ${i + 1}.`);
    changed = true;
  }
}

// ---------------------------------------------------------------------------
// 2. Inside the round map: add protestCooldownHours to the protestWindowState
//    call. Search for the `protestWindowHours:` line WITHIN the map body and
//    insert a sibling line above it.
// ---------------------------------------------------------------------------
let inMap = false, mapDepth = 0;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes("reg.season.rounds.map")) {
    inMap = true;
    mapDepth = i;
    continue;
  }
  if (!inMap) continue;
  // Stop scanning once we reach the closing `</ul>` of the rounds list.
  if (lines[i].includes("</ul>")) { inMap = false; continue; }

  if (
    /^\s*protestWindowHours:\s*$/.test(lines[i]) &&
    !lines.slice(Math.max(0, i - 3), i).some((l) => l.includes("protestCooldownHours"))
  ) {
    const indent = (lines[i].match(/^(\s*)/) || ["", ""])[1];
    lines.splice(
      i,
      0,
      `${indent}protestCooldownHours:`,
      `${indent}  reg.season.scoringSystem.protestCooldownHours,`
    );
    console.log(`Inserted protestCooldownHours into protestWindowState call near line ${i + 1}.`);
    changed = true;
    i += 2; // skip past inserted lines
  }
}

// ---------------------------------------------------------------------------
// 3. After the `const closed = w.status === "CLOSED";` line, add cooldown +
//    blocked vars (only once).
// ---------------------------------------------------------------------------
for (let i = 0; i < lines.length; i++) {
  if (
    /^\s*const\s+closed\s*=\s*w\.status\s*===\s*"CLOSED";\s*$/.test(lines[i]) &&
    !lines.slice(i + 1, Math.min(lines.length, i + 4)).some((l) =>
      l.includes("const cooldown")
    )
  ) {
    const indent = (lines[i].match(/^(\s*)/) || ["", ""])[1];
    lines.splice(
      i + 1,
      0,
      `${indent}const cooldown = w.status === "COOLDOWN";`,
      `${indent}const blocked = closed || cooldown;`
    );
    console.log(`Inserted cooldown/blocked vars after line ${i + 1}.`);
    changed = true;
    i += 2;
  }
}

// ---------------------------------------------------------------------------
// 4. The Link className uses `closed ? "opacity-60" : ""` → swap to `blocked`.
// ---------------------------------------------------------------------------
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('closed ? "opacity-60" : ""')) {
    lines[i] = lines[i].replace('closed ? "opacity-60" : ""', 'blocked ? "opacity-60" : ""');
    console.log(`Updated row className at line ${i + 1}.`);
    changed = true;
  }
}

if (!changed) {
  console.log("Nothing to do — file already in good shape.");
} else {
  fs.writeFileSync(FILE, lines.join("\n"));
}
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Re-probe ==="
grep -n 'protestCooldownHours\|const cooldown\|const blocked' src/app/reports/new/page.tsx | head -20

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Reports /new: pass protestCooldownHours into helper + add cooldown/blocked vars" || echo "(nothing to commit)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
