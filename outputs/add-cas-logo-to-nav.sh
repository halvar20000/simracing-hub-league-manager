#!/usr/bin/env bash
# Add the CAS community logo (public/logos/cas-community.webp) next to the
# existing site-logo in src/components/nav.tsx. Auto-detects the existing
# <Image .../> or <img .../> tag and clones it with the new src + alt.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/nav.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("/logos/cas-community.webp")) {
  console.log("CAS logo already in nav.tsx — nothing to do.");
  process.exit(0);
}

// Find the entire tag that contains src="/logos/site-logo.svg".
// Tag could be <Image ... /> or <img ... />.
const idx = s.indexOf('src="/logos/site-logo.svg"');
if (idx < 0) {
  console.error("Could not find site-logo.svg src.");
  process.exit(1);
}
// Walk backward from idx to find the opening '<'
let openIdx = idx;
while (openIdx > 0 && s[openIdx] !== "<") openIdx--;
// Walk forward from idx to find the closing '/>'
let closeIdx = s.indexOf("/>", idx);
if (closeIdx < 0) {
  console.error("Could not find self-closing '/>' for the logo tag.");
  process.exit(1);
}
closeIdx += 2; // include the "/>"
const original = s.slice(openIdx, closeIdx);
console.log("Found existing logo tag:");
console.log("---\n" + original + "\n---");

// Build the CAS clone: replace src and alt
let casClone = original
  .replace('src="/logos/site-logo.svg"', 'src="/logos/cas-community.webp"');
// Replace alt= attribute (any value) with "CAS Racing Community". If no alt
// exists, leave the tag — most likely there is one.
casClone = casClone.replace(/alt="[^"]*"/, 'alt="CAS Racing Community"');

// Insert the CAS clone right after the original tag, with a small gap
const insertion = "\n          " + casClone;
s = s.slice(0, closeIdx) + insertion + s.slice(closeIdx);

fs.writeFileSync(FILE, s);
console.log("Inserted CAS logo clone right after the existing one.");
console.log("");
console.log("--- New nav fragment ---");
console.log(s.slice(openIdx, closeIdx + insertion.length));
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Nav: add CAS Racing Community logo next to site logo"
git push

echo ""
echo "Done. After Vercel:"
echo "  - Every page header shows the simracing-hub logo + CAS community logo,"
echo "    same height, side by side."
