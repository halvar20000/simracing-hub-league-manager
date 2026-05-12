#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
echo "=== Lines around the webhook block + revalidatePath in registrations.ts ==="
grep -n "Never block registration on webhook failure\|revalidatePath\|postDiscordWebhook" src/lib/actions/registrations.ts
echo ""
echo "=== Tail of createRegistration (last 80 lines) ==="
tail -80 src/lib/actions/registrations.ts
