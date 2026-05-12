#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. createRegistration action — insert email block via regex
# ===========================================================================
cat > outputs-tmp/patch-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/registrations.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("sendResendEmail")) { console.log("Action: email already wired."); process.exit(0); }

if (!s.includes('from "@/lib/resend-email"')) {
  s = s.replace(
    `import { postDiscordWebhook } from "@/lib/discord-webhook";`,
    `import { postDiscordWebhook } from "@/lib/discord-webhook";\nimport { sendResendEmail } from "@/lib/resend-email";`
  );
}

const emailBlock = `
  // Fire-and-forget email notification(s)
  try {
    const lg2 = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { registrationNotifyEmails: true },
    });
    const recipients = (lg2?.registrationNotifyEmails ?? []).filter(
      (e) => typeof e === "string" && /@/.test(e)
    );
    if (recipients.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      const rosterUrl = \`\${baseUrl}/admin/leagues/\${leagueSlug}/seasons/\${seasonId}/roster\`;
      const teamLabel2 = teamId
        ? (await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }))?.name ?? "—"
        : "Independent";
      const className2 = carClassId
        ? (await prisma.carClass.findUnique({ where: { id: carClassId }, select: { name: true } }))?.name ?? "—"
        : null;
      const subject =
        existing && existing.status !== "PENDING"
          ? \`Updated registration — \${season.league.name} \${season.name}\`
          : \`New registration — \${season.league.name} \${season.name}\`;
      const escape = (v: string | number | null | undefined) =>
        String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      const html = \`
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
          <h2 style="margin: 0 0 8px 0; color: #ff6b35;">📝 \${escape(subject)}</h2>
          <p style="margin: 0 0 16px 0; color: #52525b; font-size: 13px;">
            \${existing && existing.status !== "PENDING" ? "Updated registration (was " + escape(existing.status.toLowerCase()) + ")" : "New pending registration awaiting approval"}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #71717a; width: 110px;">Driver</td><td>\${escape(user.firstName)} \${escape(user.lastName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">iRacing ID</td><td>\${escape(user.iracingMemberId)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Start #</td><td>\${startNumber != null ? "#" + escape(startNumber) : "—"}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Team</td><td>\${escape(teamLabel2)}</td></tr>
            \${className2 ? \`<tr><td style="padding: 6px 0; color: #71717a;">Class</td><td>\${escape(className2)}</td></tr>\` : ""}
            \${notes ? \`<tr><td style="padding: 6px 0; color: #71717a; vertical-align: top;">Notes</td><td>\${escape(notes)}</td></tr>\` : ""}
          </table>
          <p style="margin-top: 20px;">
            <a href="\${rosterUrl}" style="display: inline-block; background: #ff6b35; color: #18181b; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open roster</a>
          </p>
          <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring</p>
        </div>
      \`;
      const text = [
        subject, "",
        \`Driver: \${user.firstName} \${user.lastName}\`,
        \`iRacing ID: \${user.iracingMemberId}\`,
        \`Start #: \${startNumber != null ? "#" + startNumber : "—"}\`,
        \`Team: \${teamLabel2}\`,
        className2 ? \`Class: \${className2}\` : null,
        notes ? \`Notes: \${notes}\` : null,
        "", \`Open roster: \${rosterUrl}\`,
      ].filter((x): x is string => x !== null).join("\\n");
      await sendResendEmail({ to: recipients, subject, html, text });
    }
  } catch {
    // Never block registration on email failure
  }
`;

const re = /(\/\/[^\n]*Never block registration on webhook failure[^\n]*\n)(\s*)(\})\s*\n(\s*revalidatePath)/;
const m = s.match(re);
if (!m) {
  console.error("createRegistration: webhook-block end + revalidatePath pattern not found.");
  process.exit(1);
}
const matchIdx = m.index ?? 0;
const closeBraceEnd = matchIdx + m[1].length + m[2].length + m[3].length;
s = s.slice(0, closeBraceEnd) + "\n" + emailBlock + s.slice(closeBraceEnd);

fs.writeFileSync(FILE, s);
console.log("createRegistration: email block inserted.");
EOF
node outputs-tmp/patch-action.mjs

# ===========================================================================
# 2. League edit page — add the emails textarea above the webhook input
# ===========================================================================
cat > outputs-tmp/patch-edit-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/edit/page.tsx";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("registrationNotifyEmails")) { console.log("Edit page: emails field already present."); process.exit(0); }

const before = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>`;
const insert = `        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Email recipients for new registrations (one per line)
          </span>
          <textarea
            name="registrationNotifyEmails"
            rows={3}
            defaultValue={(league.registrationNotifyEmails ?? []).join("\\n")}
            placeholder={"admin@example.com\\nsteward@example.com"}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Sent via Resend. Requires RESEND_API_KEY in env. Leave blank to disable.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>`;
if (!s.includes(before)) {
  console.error("Edit page: could not find Discord webhook label anchor.");
  process.exit(1);
}
s = s.replace(before, insert);
fs.writeFileSync(FILE, s);
console.log("Edit page: emails textarea inserted.");
EOF
node outputs-tmp/patch-edit-page.mjs

# ===========================================================================
# 3. updateLeague action — parse + persist the emails list
# ===========================================================================
cat > outputs-tmp/patch-leagues-action.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/leagues.ts";
let s = fs.readFileSync(FILE, "utf8");
if (s.includes("registrationNotifyEmails")) { console.log("Leagues action: already wired."); process.exit(0); }

s = s.replace(
  `  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;`,
  `  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;
  const emailsRaw = String(formData.get("registrationNotifyEmails") ?? "");
  const registrationNotifyEmails = emailsRaw
    .split(/[\\n,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && /@/.test(e));`
);

s = s.replace(
  `    data: { name, description, discordRegistrationsWebhookUrl },`,
  `    data: { name, description, discordRegistrationsWebhookUrl, registrationNotifyEmails },`
);

fs.writeFileSync(FILE, s);
console.log("Leagues action: emails persisted.");
EOF
node outputs-tmp/patch-leagues-action.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Email notifications: complete the wiring (action, edit form, leagues action)"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Setup steps:"
echo "  1) Sign up at https://resend.com (free)."
echo "  2) Verify the simracing-hub.com domain."
echo "  3) Create an API key, add to Vercel env: RESEND_API_KEY=re_xxx"
echo "  4) Optional: RESEND_FROM=\"CLS Registrations <noreply@simracing-hub.com>\""
echo "  5) In Admin → Edit a league → 'Email recipients for new registrations' (one per line) → Save."
