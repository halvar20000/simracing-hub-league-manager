#!/usr/bin/env bash
# v2: source .env before running tsx so IRLM_USERNAME / IRLM_PASSWORD
# are actually visible to the script.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

LEAGUE_NAME="GT3WCTSeason2"
EVENT_ID="2645"

# 1. Make sure scripts/inspect-irlm-shapes.ts exists (created by previous script).
if [ ! -f scripts/inspect-irlm-shapes.ts ]; then
  echo "scripts/inspect-irlm-shapes.ts is missing — run the v1 wrapper first."
  exit 1
fi

# 2. Load .env into the current shell so the values get inherited by tsx.
if [ ! -f .env ]; then
  echo "No .env file found in $(pwd). Add IRLM_USERNAME / IRLM_PASSWORD first."
  exit 1
fi
echo "Sourcing .env ..."
set -a
# shellcheck disable=SC1091
source .env
set +a

# 3. Verify the two values are present (length only, never print the values).
USERNAME_VAL="${IRLM_USERNAME:-}"
PASSWORD_VAL="${IRLM_PASSWORD:-}"
echo "IRLM_USERNAME length: ${#USERNAME_VAL}"
echo "IRLM_PASSWORD length: ${#PASSWORD_VAL}"
if [ -z "$USERNAME_VAL" ] || [ -z "$PASSWORD_VAL" ]; then
  echo ""
  echo "Both must be non-empty. Add them to .env (one line each):"
  echo "  IRLM_USERNAME=your_username"
  echo "  IRLM_PASSWORD=your_password"
  exit 1
fi

# 4. Run the inspect script.
LEAGUE_NAME="$LEAGUE_NAME" EVENT_ID="$EVENT_ID" npx tsx scripts/inspect-irlm-shapes.ts
