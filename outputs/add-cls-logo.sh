#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ---------------------------------------------------------------------------
# Pick which CLS logo to use (default: 1).  Re-run with `2` to swap.
#   bash add-cls-logo.sh        # uses CLS_League_scoring1.png
#   bash add-cls-logo.sh 2      # uses CLS_League_Scoring2.png
# ---------------------------------------------------------------------------
CHOICE="${1:-1}"
case "$CHOICE" in
  1) SRC="logos/CLS_League_scoring1.png" ;;
  2) SRC="logos/CLS_League_Scoring2.png" ;;
  *) echo "Pass 1 or 2 (got '$CHOICE')"; exit 1 ;;
esac

if [ ! -f "$SRC" ]; then
  echo "Source logo not found: $SRC"
  exit 1
fi

DEST="public/logos/cls-league-scoring.png"
cp "$SRC" "$DEST"
echo "[+] Copied $SRC → $DEST"

# ---------------------------------------------------------------------------
# Patch src/components/nav.tsx — add CLS logo as the FIRST image and update
# the alt of the original site logo.
# ---------------------------------------------------------------------------
mkdir -p outputs-tmp
cat > outputs-tmp/patch-nav.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/nav.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = `        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub League Manager"
            className="h-12 w-auto"
          />
          <img
            src="/logos/cas-community.webp"
            alt="CAS Racing Community"
            className="h-12 w-auto"
          />
        </Link>`;

const after = `        <Link href="/" className="flex items-center gap-3">
          <img
            src="/logos/cls-league-scoring.png"
            alt="CLS — CAS League Scoring"
            className="h-12 w-auto"
          />
          <img
            src="/logos/site-logo.svg"
            alt="Simracing-Hub"
            className="h-12 w-auto"
          />
          <img
            src="/logos/cas-community.webp"
            alt="CAS Racing Community"
            className="h-12 w-auto"
          />
        </Link>`;

if (s.includes(after)) {
  console.log("Nav already has CLS logo.");
} else if (!s.includes(before)) {
  console.error("Nav anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Inserted CLS logo into nav.");
}
EOF
node outputs-tmp/patch-nav.mjs

# ---------------------------------------------------------------------------
# Patch src/app/layout.tsx — update the metadata title.
# ---------------------------------------------------------------------------
cat > outputs-tmp/patch-layout.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/layout.tsx";
let s = fs.readFileSync(FILE, "utf8");

const before = 'title: "Simracing-Hub League Manager — CAS iRacing Community",';
const after  = 'title: "CLS — CAS League Scoring",';

if (s.includes(after)) {
  console.log("Layout title already updated.");
} else if (!s.includes(before)) {
  console.error("Layout title anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("Updated metadata title.");
}
EOF
node outputs-tmp/patch-layout.mjs
rm -rf outputs-tmp

# ---------------------------------------------------------------------------
# Type-check
# ---------------------------------------------------------------------------
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

# ---------------------------------------------------------------------------
# Commit + push
# ---------------------------------------------------------------------------
git add -A
git commit -m "Branding: add CLS — CAS League Scoring logo to nav + page title"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Used logo variant: $CHOICE  ($SRC)"
echo "If you'd rather use the other one, re-run:  bash $(basename "$0") $((CHOICE == 1 ? 2 : 1))"
