#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/iracing-json.ts";
let s = fs.readFileSync(FILE, "utf8");

const before = `function mapReasonOut(reason: string | undefined): ParsedDriver["finishStatus"] {
  const r = (reason ?? "").toLowerCase();
  if (!r || r === "running" || r.includes("classified")) return "CLASSIFIED";
  if (r.includes("disqualif")) return "DSQ";
  if (r.includes("did not start") || r === "dns") return "DNS";
  return "DNF";
}`;

const after = `function mapReasonOut(reason: string | undefined): ParsedDriver["finishStatus"] {
  const r = (reason ?? "").toLowerCase();
  if (!r || r === "running" || r.includes("classified")) return "CLASSIFIED";
  if (r.includes("disqualif")) return "DSQ";
  // Match IRLM behaviour: a disconnect is treated as DSQ so the
  // DSQ-forfeit rule still applies in leagues that use it.
  if (r.includes("disconnect")) return "DSQ";
  if (r.includes("did not start") || r === "dns") return "DNS";
  return "DNF";
}`;

if (s.includes('r.includes("disconnect")')) {
  console.log("Already patched.");
} else if (!s.includes(before)) {
  console.error("mapReasonOut anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Updated mapReasonOut: Disconnected → DSQ.");
}
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
git commit -m "iRacing JSON: map 'Disconnected' to DSQ (matches IRLM behaviour)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
