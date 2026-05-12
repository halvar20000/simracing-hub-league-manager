#!/usr/bin/env bash
# Catch the shorthand-property case: { roundId, registrationId }
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch-shorthand.mjs <<'EOF'
import fs from "node:fs";
import path from "node:path";

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      out.push(...walk(p));
    } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

let total = 0;
for (const f of walk("src")) {
  let s = fs.readFileSync(f, "utf8");
  const before = s;

  // (a) Shorthand: { roundId, registrationId }
  s = s.replace(
    /roundId_registrationId:\s*\{\s*roundId,\s*registrationId\s*\}/g,
    "roundId_registrationId_raceNumber: { roundId, registrationId, raceNumber: 1 }"
  );

  // (b) Shorthand reversed: { registrationId, roundId }  (just in case)
  s = s.replace(
    /roundId_registrationId:\s*\{\s*registrationId,\s*roundId\s*\}/g,
    "roundId_registrationId_raceNumber: { registrationId, roundId, raceNumber: 1 }"
  );

  if (s !== before) {
    fs.writeFileSync(f, s);
    total++;
    console.log("patched:", f);
  }
}
console.log(`Total files patched: ${total}`);
EOF
node outputs-tmp/patch-shorthand.mjs

# Confirm no remaining old key references
echo ""
echo "Remaining 'roundId_registrationId' (should only appear with _raceNumber suffix):"
grep -rn 'roundId_registrationId' src/ | grep -v 'roundId_registrationId_raceNumber' || echo "  (clean)"

rm -rf outputs-tmp

echo ""
git add -A
git commit -m "Multirace: also patch shorthand registrationId callsite"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
