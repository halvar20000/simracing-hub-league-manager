#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/lib/actions/penalty-pool-recompute.ts'

echo "=== Rewrite $FILE so the action returns void ==="
cat > "$FILE" <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

/**
 * Server action invoked by the admin "Recompute penalty pool" button.
 * Wraps the pure helper in /lib/penalty-pool.ts and revalidates the
 * admin season page so the new pool balance is reflected immediately.
 *
 * NOTE: must return void/Promise<void> when used directly as a
 * <form action={...}> in a Server Component.
 */
export async function recomputePenaltyPoolAction(formData: FormData): Promise<void> {
  const seasonId = formData.get("seasonId");
  const leagueSlug = formData.get("leagueSlug");
  if (typeof seasonId !== "string" || !seasonId) {
    throw new Error("seasonId required");
  }
  await recomputePenaltyPoolForSeason(seasonId);
  if (typeof leagueSlug === "string" && leagueSlug) {
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  }
}
TS

echo "  Rewritten."
echo ""

echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool recompute action: return void so it can be used directly as <form action>"
git push

echo ""
echo "Done."
