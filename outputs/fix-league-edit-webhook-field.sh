#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("discordRegistrationsWebhookUrl")) {
  console.log("League edit: webhook field already present.");
  process.exit(0);
}

// Insert a raw <label> + <input> + helper text right before the
// <div className="flex gap-2"> that wraps the submit + cancel buttons.
const before = `        <div className="flex gap-2">`;
const insert = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>
          <input
            name="discordRegistrationsWebhookUrl"
            type="url"
            defaultValue={league.discordRegistrationsWebhookUrl ?? ""}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Posts a message to your Discord channel each time a driver
            submits a registration. Leave blank to disable. Get the URL
            in Discord via Channel Settings → Integrations → Webhooks.
          </span>
        </label>

        <div className="flex gap-2">`;

if (!s.includes(before)) {
  console.error("Could not find '<div className=\"flex gap-2\">' in league edit page.");
  process.exit(1);
}
s = s.replace(before, insert);
fs.writeFileSync(FILE, s);
console.log("League edit: webhook field added before the submit/cancel buttons.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Admin league edit: add Discord webhook URL input"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
