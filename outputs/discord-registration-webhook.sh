#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Schema: League.discordRegistrationsWebhookUrl
# ===========================================================================
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
if (/discordRegistrationsWebhookUrl/.test(s)) { console.log("Schema: already present."); process.exit(0); }
const lines = s.split("\n");
let inModel = false, close = -1;
for (let i = 0; i < lines.length; i++) {
  if (/^model\s+League\s*{/.test(lines[i])) { inModel = true; continue; }
  if (inModel && /^}\s*$/.test(lines[i])) { close = i; break; }
}
if (close === -1) { console.error("League brace not found."); process.exit(1); }
lines.splice(close, 0, "  discordRegistrationsWebhookUrl String?");
fs.writeFileSync(FILE, lines.join("\n"));
console.log("Schema: added discordRegistrationsWebhookUrl on League.");
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push ==="
npx --yes prisma db push --skip-generate
rm -rf node_modules/.prisma node_modules/@prisma/client .next tsconfig.tsbuildinfo
npm install @prisma/client --no-audit --no-fund
npx --yes prisma generate

# ===========================================================================
# 2. New helper: src/lib/discord-webhook.ts
# ===========================================================================
mkdir -p src/lib
cat > src/lib/discord-webhook.ts <<'TS'
/**
 * Fire-and-forget Discord webhook poster. Never throws — registration must
 * still complete even if Discord is down.
 */
export async function postDiscordWebhook(
  url: string,
  payload: {
    username?: string;
    avatar_url?: string;
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      url?: string;
      color?: number;
      timestamp?: string;
      fields?: Array<{ name: string; value: string; inline?: boolean }>;
      footer?: { text: string };
    }>;
  }
): Promise<{ ok: boolean; status: number; body?: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = res.ok ? "" : await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}
TS
echo "[+] Wrote src/lib/discord-webhook.ts"

# ===========================================================================
# 3. Patch createRegistration to fire the webhook on PENDING registration
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("postDiscordWebhook")) { console.log("Action: webhook already wired."); process.exit(0); }

// Add the import.
s = s.replace(
  `import { requireAuth } from "@/lib/auth-helpers";`,
  `import { requireAuth } from "@/lib/auth-helpers";\nimport { postDiscordWebhook } from "@/lib/discord-webhook";`
);

// Inject the webhook call right before `revalidatePath` near the end.
const before = `  revalidatePath(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
  revalidatePath(
    \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/roster\`
  );
  revalidatePath(
    \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/teams\`
  );
  redirect("/registrations?success=1");`;
const after = `  // Fire-and-forget Discord webhook (non-blocking)
  try {
    const lg = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { discordRegistrationsWebhookUrl: true },
    });
    const webhookUrl = lg?.discordRegistrationsWebhookUrl;
    if (webhookUrl) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      const teamLabel = teamId
        ? (await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }))?.name ?? "—"
        : "Independent";
      const className = carClassId
        ? (await prisma.carClass.findUnique({ where: { id: carClassId }, select: { name: true } }))?.name ?? "—"
        : null;
      const fields = [
        { name: "Driver", value: \`\${user.firstName} \${user.lastName}\`, inline: true },
        { name: "iRacing ID", value: String(user.iracingMemberId), inline: true },
        { name: "Start #", value: startNumber != null ? \`#\${startNumber}\` : "—", inline: true },
        { name: "Team", value: teamLabel, inline: true },
      ];
      if (className) fields.push({ name: "Class", value: className, inline: true });
      if (notes) fields.push({ name: "Notes", value: notes });
      await postDiscordWebhook(webhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: \`📝 New registration — \${season.league.name} \${season.name}\`,
            description:
              existing && existing.status !== "PENDING"
                ? \`Updated registration (was \${existing.status.toLowerCase()})\`
                : "New pending registration awaiting approval",
            url: \`\${baseUrl}/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/roster\`,
            color: 0xff6b35,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    }
  } catch {
    // Never block registration on webhook failure
  }

  revalidatePath(\`/leagues/\${leagueSlug}/seasons/\${seasonId}\`);
  revalidatePath(
    \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/roster\`
  );
  revalidatePath(
    \`/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/teams\`
  );
  redirect("/registrations?success=1");`;

if (!s.includes(before)) { console.error("createRegistration end-of-action anchor not found."); process.exit(1); }
s = s.replace(before, after);

fs.writeFileSync(FILE, s);
console.log("Action: webhook firing on registration submit.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 4. Admin league edit page — add a webhook URL field + test button
# ===========================================================================
echo ""
echo "=== Admin league edit page ==="
cat 'src/app/admin/leagues/[slug]/edit/page.tsx' 2>/dev/null | head -60 || true

cat > outputs-tmp/patch-league-edit.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/edit/page.tsx";
if (!fs.existsSync(FILE)) {
  console.log("(no league edit page — skipping form addition; webhook URL can be set via DB or future admin form)");
  process.exit(0);
}
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("discordRegistrationsWebhookUrl")) { console.log("League edit: webhook field already present."); process.exit(0); }

// Add a Field entry just before the form's submit button.
// Best-effort: insert before the first occurrence of `<button type="submit"` or `<SubmitWithSpinner` inside the form.
const fieldBlock = `        <Field
          label="Discord webhook URL for registrations (optional)"
          name="discordRegistrationsWebhookUrl"
          defaultValue={league.discordRegistrationsWebhookUrl ?? ""}
          placeholder="https://discord.com/api/webhooks/..."
        />
        <p className="-mt-3 text-xs text-zinc-500">
          Posts a message to your Discord channel each time a driver submits
          a registration. Leave blank to disable. Get a webhook URL via
          Channel Settings → Integrations → Webhooks in Discord.
        </p>
`;

const insertAt = Math.max(s.indexOf('<button type="submit"'), s.indexOf("<SubmitWithSpinner"));
if (insertAt === -1) { console.error("League edit: submit button anchor not found."); process.exit(1); }
// Walk back to the start of the line to align indentation.
const lineStart = s.lastIndexOf("\n", insertAt);
s = s.slice(0, lineStart + 1) + fieldBlock + s.slice(lineStart + 1);
fs.writeFileSync(FILE, s);
console.log("League edit: webhook URL field added.");
EOF
node outputs-tmp/patch-league-edit.mjs

# ===========================================================================
# 5. Update updateLeague action to save the webhook URL
# ===========================================================================
cat > outputs-tmp/patch-league-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/leagues.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("discordRegistrationsWebhookUrl")) { console.log("Leagues action: already wired."); process.exit(0); }

// Add to updateLeague body. Find updateLeague then patch.
const before = `  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect(\`/admin/leagues/\${id}/edit?error=Name+is+required\`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: { name, description },
  });`;
const after = `  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;
  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;

  if (!name) {
    redirect(\`/admin/leagues/\${id}/edit?error=Name+is+required\`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: { name, description, discordRegistrationsWebhookUrl },
  });`;

if (!s.includes(before)) { console.error("Leagues action anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Leagues action: webhook URL persisted.");
EOF
node outputs-tmp/patch-league-action.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Discord webhook: fire on registration submit (per-league webhook URL on League model + edit form)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Setup once: Admin → CAS IEC → Edit league → paste a Discord webhook URL → Save."
echo "Get the URL from Discord channel settings → Integrations → Webhooks → Copy URL."
