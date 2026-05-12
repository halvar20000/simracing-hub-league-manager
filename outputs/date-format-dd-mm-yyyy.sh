#!/usr/bin/env bash
# Switch every date display sitewide to DD-MM-YYYY HH:MM (24-hour time).
# Adds src/lib/date.ts with formatDateTime() + formatDate(),
# replaces every `new Date(X).toLocaleString()` with `formatDateTime(X)`,
# and inserts the import wherever it's missing.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Date utility
# ------------------------------------------------------------
echo ">>> Writing src/lib/date.ts..."
mkdir -p src/lib

cat > src/lib/date.ts <<'EOF'
function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/**
 * Format a date as DD-MM-YYYY HH:MM (24-hour clock).
 */
export function formatDateTime(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return (
    pad(date.getDate()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    date.getFullYear() +
    " " +
    pad(date.getHours()) +
    ":" +
    pad(date.getMinutes())
  );
}

/**
 * Format a date as DD-MM-YYYY (no time).
 */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return (
    pad(date.getDate()) +
    "-" +
    pad(date.getMonth() + 1) +
    "-" +
    date.getFullYear()
  );
}
EOF

# ------------------------------------------------------------
# 2. Replace toLocaleString() and add import where needed
# ------------------------------------------------------------
echo ">>> Replacing date displays in all page files..."

FILES=$(grep -rl "toLocaleString()" src/app 2>/dev/null || true)

for f in $FILES; do
  echo "  patching $f"
  # Replace the call
  sed -i '' \
    's|new Date(\([^)]*\))\.toLocaleString()|formatDateTime(\1)|g' "$f"

  # Insert the import after the last existing 'import' line, if missing
  if ! grep -q 'from "@/lib/date"' "$f"; then
    awk '
      /^import / { last = NR }
      { lines[NR] = $0 }
      END {
        for (i = 1; i <= NR; i++) {
          print lines[i]
          if (i == last) {
            print "import { formatDateTime } from \"@/lib/date\";"
          }
        }
      }
    ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
  fi
done

echo ""
echo "Done. Refresh the browser to see DD-MM-YYYY HH:MM dates everywhere."
