#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

mkdir -p outputs-tmp
cat > outputs-tmp/patch-track.mjs <<'EOF'
import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// h1: from `R{round.roundNumber}` -> `R{round.roundNumber} — {round.name}`
const h1Old = `<h1 className="text-2xl font-bold">R{round.roundNumber}</h1>`;
const h1New = `<h1 className="text-2xl font-bold">
            R{round.roundNumber} — {round.name}
          </h1>`;

if (s.includes("R{round.roundNumber} — {round.name}")) {
  console.log("h1 already includes round.name.");
} else {
  if (!s.includes(h1Old)) {
    console.error("Could not find current h1.");
    process.exit(1);
  }
  s = s.replace(h1Old, h1New);
  console.log("h1 updated to include round.name.");
}

// subtitle: prepend track + (config) before the date.
const subtitleOld =
`<p className="text-sm text-zinc-400">
            {formatDateTime(round.startsAt)}
            {isMulticlass && " • Multiclass"}
          </p>`;
const subtitleNew =
`<p className="text-sm text-zinc-400">
            {round.track}
            {round.trackConfig ? \` (\${round.trackConfig})\` : ""}
            {" • "}
            {formatDateTime(round.startsAt)}
            {isMulticlass && " • Multiclass"}
          </p>`;

if (s.includes("{round.track}\n            {round.trackConfig")) {
  console.log("Subtitle already includes track.");
} else {
  if (!s.includes(subtitleOld)) {
    console.error("Could not find current subtitle.");
    process.exit(1);
  }
  s = s.replace(subtitleOld, subtitleNew);
  console.log("Subtitle now includes track + trackConfig.");
}

fs.writeFileSync(PAGE, s);
EOF
node outputs-tmp/patch-track.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity check:"
grep -n 'round\.name\|round\.track\|R{round.roundNumber}' "$PAGE" | head -10

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: show round name + track in header"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
