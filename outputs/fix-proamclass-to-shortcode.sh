#!/usr/bin/env bash
# CarClass has no proAmClass field — use shortCode instead.
# Pro/Am ordering: shortCode === "PRO" -> 0, "AM" -> 1, else 2 + displayOrder.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/patch-proamclass.mjs <<'PATCH_EOF'
import fs from "node:fs";

const PAGE =
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Group type: rename proAmClass -> shortCode (string|null).
s = s.replace(
  /proAmClass: string \| null;/,
  "shortCode: string | null;"
);

// 2) Group construction: use cc?.shortCode instead of cc?.proAmClass.
s = s.replace(
  /proAmClass: \(cc\?\.proAmClass as string \| undefined\) \?\? null,/,
  "shortCode: cc?.shortCode ?? null,"
);

// 3) Group sort: use g.shortCode instead of g.proAmClass.
s = s.replace(
  /g\.proAmClass === "PRO" \? 0 : g\.proAmClass === "AM" \? 1 : 2 \+ g\.displayOrder/g,
  'g.shortCode === "PRO" ? 0 : g.shortCode === "AM" ? 1 : 2 + g.displayOrder'
);

fs.writeFileSync(PAGE, s);
console.log("Switched proAmClass references to shortCode.");
PATCH_EOF

node scripts/patch-proamclass.mjs

echo ""
echo "Confirm no remaining proAmClass references in the public round page:"
grep -n 'proAmClass' \
  'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' \
  || echo "  (clean)"

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Public round page: use carClass.shortCode for Pro/Am ordering"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
