#!/usr/bin/env bash
# Diagnostic: replace irlm-import.ts with a minimal "use server" stub.
# - If after deploy the button works (Vercel logs show "[IRLM stub]"), the
#   server-action plumbing is fine and the bug is somewhere in the real
#   action body. We can then add the body back piece by piece.
# - If after deploy the button STILL shows javascript:throw, the bug is
#   structural: Next.js isn't treating this file as a server-actions module.
#   In that case the next thing to check is whether the actual on-disk file
#   has "use server" as its very first statement (no BOM, no comment before),
#   and whether there's a duplicate file shadowing the import path.
#
# This script also makes a backup at irlm-import.ts.bak so you can restore
# the real file with one mv command after testing.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PATH_TS=src/lib/actions/irlm-import.ts

if [ ! -f "$PATH_TS" ]; then
  echo "ERROR: $PATH_TS does not exist. Are you in the right repo?"
  exit 1
fi

echo "Backing up the real action file..."
cp "$PATH_TS" "$PATH_TS.bak"
echo "  -> $PATH_TS.bak"
echo ""

echo "Writing minimal stub..."
cat > "$PATH_TS" <<'EOF'
"use server";

import { redirect } from "next/navigation";

export async function pullResultsFromIRLM(formData: FormData): Promise<void> {
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  console.log("[IRLM stub] action invoked", { leagueSlug, seasonId, roundId });
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?stub=1`
  );
}
EOF

echo "Stub written. Verify directive is the very first line:"
head -3 "$PATH_TS"

echo ""
echo "Quick scan for any other file exporting pullResultsFromIRLM"
echo "(should ONLY list src/lib/actions/irlm-import.ts):"
grep -rln "pullResultsFromIRLM" src/ | grep -v node_modules || true

echo ""
echo "Check for hidden BOM/non-ASCII at the top of the file:"
head -c 12 "$PATH_TS" | od -c | head -1

echo ""
echo "Push and test:"
echo "  git add -A && git commit -m 'IRLM: minimal stub action for diagnosis' && git push"
echo ""
echo "After Vercel redeploys:"
echo "  1. Right-click the 'Pull from iRLM' button -> Inspect."
echo "     - If <form action=\"javascript:throw...\"> => structural problem (server-action transform not applied to this file)."
echo "     - If <form action=\"/.../$ACT...\"> with a hashed action ID => server-action plumbing is healthy."
echo "  2. Click the button. You should land on the round page with ?stub=1 in the URL."
echo "  3. Check Vercel function logs for: '[IRLM stub] action invoked'"
echo ""
echo "When done diagnosing, restore the real action with:"
echo "  mv $PATH_TS.bak $PATH_TS"
echo "  git add -A && git commit -m 'Restore real iRLM action' && git push"
