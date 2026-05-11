#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Restore the original actions file from git HEAD
#    (I overwrote it; git still has the real one.)
# ============================================================================
echo "=== 1. Restore src/lib/actions/penalty-pool.ts from git HEAD ==="
git show HEAD:src/lib/actions/penalty-pool.ts > src/lib/actions/penalty-pool.ts
echo "  Restored. Verifying expected exports..."
grep -E '^export async function (forgivePenalty|releasePenalty|unreleasePenalty|releaseAllPending)\b' src/lib/actions/penalty-pool.ts || {
  echo "!!! Restored file is missing expected exports. Aborting."
  exit 1
}
echo "  Original exports present."

# ============================================================================
# 2. Put my new recompute action in a separate file so it can't clobber
# ============================================================================
echo ""
echo "=== 2. Write src/lib/actions/penalty-pool-recompute.ts (new file) ==="
cat > src/lib/actions/penalty-pool-recompute.ts <<'TS'
"use server";

import { revalidatePath } from "next/cache";
import { recomputePenaltyPoolForSeason } from "@/lib/penalty-pool";

/**
 * Server action invoked by the admin "Recompute penalty pool" button.
 * Wraps the pure helper in /lib/penalty-pool.ts and revalidates the
 * admin season page so the new pool balance is reflected immediately.
 */
export async function recomputePenaltyPoolAction(formData: FormData) {
  const seasonId = formData.get("seasonId");
  const leagueSlug = formData.get("leagueSlug");
  if (typeof seasonId !== "string" || !seasonId) {
    throw new Error("seasonId required");
  }
  const result = await recomputePenaltyPoolForSeason(seasonId);
  if (typeof leagueSlug === "string" && leagueSlug) {
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
    revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/penalty-pool`);
  }
  return result;
}
TS
echo "  Wrote src/lib/actions/penalty-pool-recompute.ts"

# ============================================================================
# 3. Verify the engine file is still in place (we wrote it last time)
# ============================================================================
echo ""
echo "=== 3. Verify engine file ==="
test -f src/lib/penalty-pool.ts && echo "  src/lib/penalty-pool.ts present." || {
  echo "!!! src/lib/penalty-pool.ts missing. Re-run penalty-pool-phase1-resume.sh first."
  exit 1
}

# ============================================================================
# 4. tsc
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool (Phase 1, GT3 WCT): recompute engine in src/lib/penalty-pool.ts + server action in a separate file. Existing penalty-pool actions untouched."
git push

echo ""
echo "Done."
