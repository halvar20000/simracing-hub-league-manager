#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Current updateLeague (full) ==="
awk '/^export async function updateLeague/,/^}/' src/lib/actions/leagues.ts

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/leagues.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("registrationNotifyEmails")) {
  console.log("Already wired.");
  process.exit(0);
}

// We replace the entire body of updateLeague with one that reads + saves
// the two extra fields. Use a regex that matches "export async function
// updateLeague(...) { ... }" robustly.
const re = /export async function updateLeague\([^)]*\) \{[\s\S]*?\n\}/;
const m = s.match(re);
if (!m) {
  console.error("Could not find updateLeague function block.");
  process.exit(1);
}

const newFn = `export async function updateLeague(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;

  const emailsRaw = String(formData.get("registrationNotifyEmails") ?? "");
  const registrationNotifyEmails = emailsRaw
    .split(/[\\n,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && /@/.test(e));

  if (!name) {
    redirect(\`/admin/leagues/\${id}/edit?error=Name+is+required\`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: {
      name,
      description,
      discordRegistrationsWebhookUrl,
      registrationNotifyEmails,
    },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(\`/admin/leagues/\${updated.slug}\`);
}`;

s = s.replace(re, newFn);
fs.writeFileSync(FILE, s);
console.log("updateLeague rewritten with all four fields.");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== updateLeague after patch ==="
awk '/^export async function updateLeague/,/^}/' src/lib/actions/leagues.ts

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "updateLeague: actually persist discord webhook URL + registration notify emails"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo "Then re-fill the GT4 TSS edit form, save, and the values should stay."
