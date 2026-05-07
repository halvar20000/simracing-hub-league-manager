#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Create GitHub Actions workflow ==="
mkdir -p .github/workflows
cat > .github/workflows/cron-reporting-open.yml <<'YAML'
name: Notify reporting open

on:
  schedule:
    # Every 30 minutes, on the :00 and :30 marks (UTC).
    - cron: "*/30 * * * *"
  # Allow manual run from GitHub UI for testing
  workflow_dispatch:

jobs:
  notify:
    runs-on: ubuntu-latest
    timeout-minutes: 2
    steps:
      - name: Call cron endpoint
        run: |
          set -euo pipefail
          response=$(curl -fsS \
            -H "Authorization: Bearer ${{ secrets.CRON_SECRET }}" \
            -w "\nHTTP_STATUS:%{http_code}" \
            https://league.simracing-hub.com/api/cron/notify-reporting-open)
          echo "$response"
          status=$(echo "$response" | tail -1 | sed 's/HTTP_STATUS://')
          if [ "$status" != "200" ]; then
            echo "::error::Endpoint returned HTTP $status"
            exit 1
          fi
YAML
echo "  Written .github/workflows/cron-reporting-open.yml"

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "GitHub Actions: hit cron endpoint every 30 min (free, no Hobby limit)"
git push

echo ""
echo "=== Done. NOW SET UP THE GITHUB ACTIONS SECRET ==="
echo ""
echo "GitHub Actions cannot read Vercel env vars, so we need to set CRON_SECRET"
echo "as a GitHub Actions secret too (same value)."
echo ""
echo "  1) Go to https://github.com/halvar20000/simracing-hub-league-manager/settings/secrets/actions"
echo "  2) Click 'New repository secret'"
echo "  3) Name:  CRON_SECRET"
echo "  4) Secret: 63a209594c7bd3f3031e3bf46d7789a8c456209dec27b46075b3618ff3ac5631"
echo "  5) Click 'Add secret'"
echo ""
echo "Then test the workflow runs:"
echo "  • Go to https://github.com/halvar20000/simracing-hub-league-manager/actions"
echo "  • Pick 'Notify reporting open' from the left sidebar"
echo "  • Click 'Run workflow' (top right) → Run workflow"
echo "  • Wait ~30s, click into the run, check it's green"
echo ""
echo "After that, GitHub will run it automatically every 30 minutes."
echo "First scheduled run can take up to 1 hour after the workflow file is"
echo "pushed (GitHub indexes new workflows asynchronously)."
echo ""
echo "Note: Vercel's daily cron is still in vercel.json as a redundant backup."
echo "Both call the same endpoint, idempotent via reportingNotifiedAt — no harm."
